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

  const time = clube?.toLowerCase().includes("brasil") || !clube ? "Seleção Brasileira (amarela com detalhes verdes)" : clube;
  const prompt = `FOTOGRAFIA REALISTA estilo figurinha Panini Copa do Mundo 2026.

INSTRUÇÃO CRÍTICA: Preserve EXATAMENTE o rosto, traços, cor de pele, cabelo e expressão da pessoa da foto enviada. NÃO desenhe, NÃO cartoonize. Mantenha o rosto fotográfico real, apenas integrado no novo cenário.

CENA: A pessoa veste o uniforme oficial de futebol do ${time}, fotografia de corpo inteiro ou meio corpo, pose de jogador profissional (braços cruzados ou bola sob o braço), em um estádio de futebol com torcida desfocada ao fundo, iluminação dramática de holofotes.

ENQUADRAMENTO: Figurinha colecionável retangular vertical (proporção 3:4). Borda dourada metálica brilhante. Fundo holográfico sutil verde e amarelo nas laterais. No rodapé da figurinha, em letras grandes brancas com sombra: "${nome.toUpperCase()}". No topo, pequena bandeira do Brasil 🇧🇷.

ESTILO: Fotorrealista, qualidade 4K, cores vibrantes, iluminação cinematográfica. NUNCA estilo desenho, anime ou cartoon.`;

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
