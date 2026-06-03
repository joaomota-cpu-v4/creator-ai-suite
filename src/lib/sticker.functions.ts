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
      .from("orders").select("id, quantity, status, nome, email").eq("id", data.order_id).maybeSingle();
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
      const orderPatch: Record<string, string> = {};
      if (needsUpdate) orderPatch.sticker_id = stickerId;
      if (!order.nome) orderPatch.nome = data.nome;
      if (!order.email) orderPatch.email = data.email;
      if (Object.keys(orderPatch).length > 0) {
        await supabaseAdmin.from("orders").update(orderPatch).eq("id", data.order_id);
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

async function generateFigurinha({ nome, clube, foto_base64, stickerId, data_nascimento, altura_cm, peso_kg }: { nome: string; clube?: string | null; foto_base64: string; stickerId: string; data_nascimento?: string | null; altura_cm?: number | null; peso_kg?: number | null }) {
  const nascimento = data_nascimento
    ? new Date(data_nascimento).toLocaleDateString("pt-BR").replace(/\//g, "-")
    : "-";
  const altura = altura_cm ? `${(altura_cm / 100).toFixed(2).replace(".", ",")}m` : "-";
  const peso = peso_kg ? `${peso_kg}kg` : "-";
  const nomeUpper = nome.toUpperCase();
  const clubeUpper = (clube || "BRASIL").toUpperCase();

  const prompt = `Create a premium modern football album collectible card, vertical 2:3 format, using the uploaded reference photo as the athlete portrait.

PORTRAIT:
- Keep one centered athlete only, smiling naturally, looking directly at the camera.
- Preserve the person's recognizable facial features, skin tone, hair, eyes and natural expression from the uploaded photo.
- Use realistic studio photography, soft even lighting, sharp focus, natural skin texture and professional retouching.
- Do not cartoonize, caricature, repaint, distort, age-change, or alter the identity.

WARDROBE:
- Yellow Brazil-inspired football jersey with green collar and sleeve details, realistic athletic fabric and a clean generic shield crest on the chest.
- Avoid malformed badges, fake brand marks, random letters, extra logos, or messy symbols.

BACKGROUND:
- Vibrant turquoise-blue sports background with huge layered numbers "23" behind the athlete in green and yellow.
- Add depth with clean modern graphic shapes, subtle shadows, and a right-side vertical transparent "BRA" text element.
- Add a small Brazil flag icon on the right side. Keep the background clean, not crowded.
- Top right: simple white "FIFA" style wordmark only if it is crisp and readable; otherwise use a clean white football tournament mark.

CARD DESIGN:
- Premium official-looking football card, contemporary sports graphic design, high-quality print finish.
- Rounded card corners, subtle glossy finish, clean margins, no clutter.
- Bottom: rounded teal-blue name bar with the exact player name in uppercase white letters:
  "${nomeUpper}"
- Under the name, render this exact stats line in a modern sports font:
  "${nascimento} | ${altura} | ${peso}"
- At the very bottom, add a smaller clean strip with the exact club text:
  "${clubeUpper}"

QUALITY RULES:
- Text must be crisp, readable, centered, and spelled exactly as provided.
- Keep hands out of frame if possible. Avoid distorted face, crossed eyes, extra people, bad anatomy, blurry image, pixelation, noisy background, cut-off head, broken logos, illegible text, random words, watermark, or amateur layout.`;

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
