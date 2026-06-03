import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveOrderId } from "./order.functions";
import { generateSticker as aiGenerateSticker } from "./ai/providers.server";

const CreateInput = z.object({
  order_id: z.string().uuid(),
  nome: z.string().min(1).max(80),
  email: z.string().email().max(200),
  data_nascimento: z.string().optional().nullable(),
  clube: z.string().max(80).optional().nullable(),
  peso_kg: z.coerce.number().min(1).max(300).optional().nullable(),
  altura_cm: z.coerce.number().min(30).max(250).optional().nullable(),
  foto_base64: z.string().min(100),
});

export const createSticker = createServerFn({ method: "POST" })
  .inputValidator((d) => CreateInput.parse(d))
  .handler(async ({ data }) => {
    // valida limite do pedido
    const { data: order } = await supabaseAdmin
      .from("orders").select("id, quantity, status").eq("id", data.order_id).maybeSingle();
    if (!order) throw new Error("Pedido não encontrado");
    if (order.status === "CONFIRMED") {
      // OK gerar mesmo confirmado, mas respeitando quantity
    }
    const { count } = await supabaseAdmin
      .from("stickers").select("*", { count: "exact", head: true }).eq("order_id", data.order_id);
    if ((count ?? 0) >= order.quantity) {
      throw new Error(`Limite do plano atingido (${order.quantity} figurinha${order.quantity > 1 ? "s" : ""}).`);
    }

    const stickerId = crypto.randomUUID();

    const match = data.foto_base64.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!match) throw new Error("Foto inválida");
    const mime = match[1];
    const ext = mime.split("/")[1] || "png";
    const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
    const path = `${stickerId}/original.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("user-photos")
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (upErr) throw new Error(upErr.message);

    const { error: insErr } = await supabaseAdmin.from("stickers").insert({
      id: stickerId,
      order_id: data.order_id,
      nome: data.nome,
      email: data.email,
      data_nascimento: data.data_nascimento || null,
      clube: data.clube || null,
      peso_kg: data.peso_kg || null,
      altura_cm: data.altura_cm || null,
      foto_original_path: path,
      status: "draft",
    });
    if (insErr) throw new Error(insErr.message);

    // Atualiza orders.sticker_id se ainda estiver vazio ou apontando pra algo inexistente
    const { data: cur } = await supabaseAdmin
      .from("orders").select("sticker_id").eq("id", data.order_id).maybeSingle();
    if (cur) {
      let needsUpdate = !cur.sticker_id;
      if (cur.sticker_id) {
        const { data: existsAsSticker } = await supabaseAdmin
          .from("stickers").select("id").eq("id", cur.sticker_id).maybeSingle();
        needsUpdate = !existsAsSticker;
      }
      if (needsUpdate) {
        await supabaseAdmin.from("orders").update({ sticker_id: stickerId }).eq("id", data.order_id);
      }
    }

    try {
      const figurinhaUrl = await generateFigurinha({
        nome: data.nome,
        clube: data.clube,
        foto_base64: data.foto_base64,
        stickerId,
        data_nascimento: data.data_nascimento,
        altura_cm: data.altura_cm,
        peso_kg: data.peso_kg,
      });
      await supabaseAdmin
        .from("stickers")
        .update({ figurinha_url: figurinhaUrl, preview_url: figurinhaUrl, status: "generated" })
        .eq("id", stickerId);
    } catch (e) {
      console.error("generation failed", e);
      await supabaseAdmin.from("orders").update({ sticker_id: null }).eq("id", data.order_id).eq("sticker_id", stickerId);
      await supabaseAdmin.from("stickers").delete().eq("id", stickerId);
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Falha ao gerar a figurinha: ${message}`);
    }

    return { id: stickerId };
  });

async function generateFigurinha({ nome, foto_base64, stickerId, data_nascimento, altura_cm, peso_kg }: { nome: string; clube?: string | null; foto_base64: string; stickerId: string; data_nascimento?: string | null; altura_cm?: number | null; peso_kg?: number | null }) {
  const nascimento = data_nascimento
    ? new Date(data_nascimento).toLocaleDateString("pt-BR")
    : "—";
  const altura = altura_cm ? `${(altura_cm / 100).toFixed(2).replace(".", ",")} m` : "—";
  const peso = peso_kg ? `${peso_kg} kg` : "—";
  const nomeUpper = nome.toUpperCase();

  const prompt = `Create a premium photorealistic Brazilian World Cup collectible trading card (Panini/FIFA style) using the uploaded photograph of the child.

ABSOLUTE FACE RULE — most important:
- Use the EXACT face from the uploaded photo. Same identity, same skin tone, same hair, same eyes, same smile, same age (a real child).
- Do NOT illustrate, cartoonize, anime-fy, stylize or repaint the face. The face must remain a real photograph of the same person, only relit to match the scene.
- If you change the face, the card is wrong.

WARDROBE:
- Dress the child in the official yellow Brazil national team jersey (camisa amarela da Seleção Brasileira) with green collar/trim and CBF-style shield. Realistic fabric texture, natural folds, photographic lighting on the shirt.

BACKGROUND / SCENE:
- Vibrant Brazil-themed background behind the child: green and yellow paint brush strokes, confetti in green/yellow/blue, soft blurred football stadium with stadium lights and crowd bokeh, cinematic dramatic lighting on the face.

CARD LAYOUT (vertical, 3:4 aspect ratio, like classic Panini cards):
- Thick glossy METALLIC GOLD border framing the whole card, slightly rounded corners, subtle holographic shine in the corners.
- TOP LEFT: small green & yellow CBF-style shield with 5 gold stars above it and a soccer ball icon inside.
- TOP RIGHT: small white rounded badge with green text reading "26 / COPA / 2026" stacked on three lines.
- BOTTOM CENTER: dark blue ribbon banner with thin gold outline containing the player name "${nomeUpper}" in bold white italic display sports typography with subtle shadow.
- Directly under the banner: small yellow text "★ ATACANTE ★".
- BOTTOM STRIP: a yellow/gold gradient info bar with three small icon+label groups in dark navy text, evenly spaced:
  1) calendar icon + "${nascimento}" / "NASCIMENTO"
  2) height-ruler icon + "${altura}" / "ALTURA"
  3) weight icon + "${peso}" / "PESO"
  Text must be crisp, legible and spelled exactly as written.

STYLE:
- Photorealistic, sharp focus, 4K detail, vibrant saturated colors, glossy premium trading-card finish, lens flares and confetti sparkles. NO cartoon, NO illustration, NO painting — fully photographic for the person, with graphic card overlays on top.`;

  const result = await aiGenerateSticker({ prompt, imageDataUrl: foto_base64, stickerId });
  return result.publicUrl;
}

export const getStickerPublic = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("stickers")
      .select("id, nome, clube, status, figurinha_url, preview_url, order_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Figurinha não encontrada");
    return row;
  });

export const getOrderPublic = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ stickerId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const orderId = await resolveOrderId(data.stickerId);
    if (!orderId) return null;
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, status, metodo, pix_qr_code, pix_copy_paste, invoice_url, valor_centavos")
      .eq("id", orderId).maybeSingle();
    return order;
  });
