import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CreateInput = z.object({
  nome: z.string().min(1).max(80),
  email: z.string().email().max(200),
  data_nascimento: z.string().optional().nullable(),
  clube: z.string().max(80).optional().nullable(),
  peso_kg: z.coerce.number().min(1).max(300).optional().nullable(),
  altura_cm: z.coerce.number().min(30).max(250).optional().nullable(),
  foto_base64: z.string().min(100), // data URL
});

export const createSticker = createServerFn({ method: "POST" })
  .inputValidator((d) => CreateInput.parse(d))
  .handler(async ({ data }) => {
    const stickerId = crypto.randomUUID();

    // upload original photo
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

    // Generate sticker via Lovable AI (async-ish: do it now to keep flow simple)
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
    }

    return { id: stickerId };
  });

async function generateFigurinha({ nome, foto_base64, stickerId, data_nascimento, altura_cm, peso_kg }: { nome: string; clube?: string | null; foto_base64: string; stickerId: string; data_nascimento?: string | null; altura_cm?: number | null; peso_kg?: number | null }) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

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

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-pro-image-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: foto_base64 } },
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI error ${res.status}: ${t}`);
  }
  const json = await res.json();
  const parts = json?.choices?.[0]?.message?.images || json?.choices?.[0]?.message?.content;
  let dataUrl: string | null = null;
  if (Array.isArray(parts)) {
    for (const p of parts) {
      const u = p?.image_url?.url || p?.url;
      if (typeof u === "string" && u.startsWith("data:image")) {
        dataUrl = u;
        break;
      }
    }
  }
  if (!dataUrl) throw new Error("No image returned");

  const m = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) throw new Error("Bad image data");
  const ext = m[1].split("/")[1] || "png";
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  const outPath = `${stickerId}/figurinha.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from("stickers")
    .upload(outPath, bytes, { contentType: m[1], upsert: true });
  if (error) throw new Error(error.message);

  const { data: pub } = supabaseAdmin.storage.from("stickers").getPublicUrl(outPath);
  return pub.publicUrl;
}

export const getStickerPublic = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("stickers")
      .select("id, nome, clube, status, figurinha_url, preview_url")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Figurinha não encontrada");
    return row;
  });

export const getOrderPublic = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ stickerId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, status, metodo, pix_qr_code, pix_copy_paste, invoice_url, valor_centavos")
      .eq("sticker_id", data.stickerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return order;
  });
