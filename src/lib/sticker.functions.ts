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
      });
      await supabaseAdmin
        .from("stickers")
        .update({ figurinha_url: figurinhaUrl, preview_url: figurinhaUrl, status: "generated" })
        .eq("id", stickerId);
    } catch (e) {
      console.error("generation failed", e);
      // keep status draft - UI can retry
    }

    return { id: stickerId };
  });

async function generateFigurinha({ nome, clube, foto_base64, stickerId }: { nome: string; clube?: string | null; foto_base64: string; stickerId: string }) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const prompt = `Crie uma figurinha de álbum estilo Panini Copa do Mundo 2026 com a criança da foto enviada. 
Use o rosto da foto como referência (mantenha as feições da criança). 
Vista a criança com uniforme oficial de futebol ${clube ? `do ${clube}` : "verde e amarelo do Brasil"}. 
Pose dinâmica de craque, com bola, em campo de futebol ao fundo.
Borda dourada brilhante de figurinha colecionável, fundo holográfico azul e amarelo.
No rodapé da figurinha, escreva o nome "${nome.toUpperCase()}" em letras grandes brancas.
Estilo: ilustração realista premium, cores vibrantes, iluminação dramática de estádio.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image-preview",
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
