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

export const createStickerDraft = createServerFn({ method: "POST" })
  .inputValidator((d) => CreateInput.parse(d))
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from("orders").select("id, quantity, nome, email").eq("id", data.order_id).maybeSingle();
    if (!order) throw new Error("Pedido não encontrado");

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

    const { data: cur } = await supabaseAdmin
      .from("orders").select("sticker_id").eq("id", data.order_id).maybeSingle();
    const orderPatch: Record<string, string> = {};
    if (!cur?.sticker_id) orderPatch.sticker_id = stickerId;
    if (!order.nome) orderPatch.nome = data.nome;
    if (!order.email) orderPatch.email = data.email;
    if (Object.keys(orderPatch).length > 0) {
      await supabaseAdmin.from("orders").update(orderPatch).eq("id", data.order_id);
    }

    return { id: stickerId };
  });

async function blobToDataUrl(blob: Blob, fallbackMime = "image/jpeg") {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const base64 = typeof Buffer !== "undefined"
    ? Buffer.from(bytes).toString("base64")
    : btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
  return `data:${blob.type || fallbackMime};base64,${base64}`;
}

async function bufferToDataUrl(bytes: ArrayBuffer | Uint8Array, mime = "image/png") {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const base64 = typeof Buffer !== "undefined"
    ? Buffer.from(buffer).toString("base64")
    : btoa(Array.from(buffer, (b) => String.fromCharCode(b)).join(""));
  return `data:${mime};base64,${base64}`;
}

async function getStickerTemplateDataUrl() {
  const publicBase = process.env.APP_PUBLIC_URL || process.env.PUBLIC_SITE_URL || process.env.SITE_URL || process.env.URL;
  if (publicBase) {
    try {
      const res = await fetch(`${publicBase.replace(/\/+$/, "")}/assets/sticker-preview-bg.png`);
      if (res.ok) return bufferToDataUrl(await res.arrayBuffer(), "image/png");
    } catch (e) {
      console.warn("[AI] template fetch failed", e);
    }
  }

  try {
    const { readFile } = await import(/* @vite-ignore */ "node:fs/promises");
    const { join } = await import(/* @vite-ignore */ "node:path");
    const bytes = await readFile(join(process.cwd(), "public", "assets", "sticker-preview-bg.png"));
    return bufferToDataUrl(bytes, "image/png");
  } catch (e) {
    console.warn("[AI] local template unavailable", e);
    return null;
  }
}

async function getStickerBackgroundHref() {
  try {
    const { readFile } = await import(/* @vite-ignore */ "node:fs/promises");
    const { join } = await import(/* @vite-ignore */ "node:path");
    const svg = await readFile(join(process.cwd(), "public", "assets", "sticker-preview-bg.svg"), "utf8");
    const base64 = typeof Buffer !== "undefined"
      ? Buffer.from(svg).toString("base64")
      : btoa(svg);
    return `data:image/svg+xml;base64,${base64}`;
  } catch (e) {
    console.warn("[sticker] background SVG unavailable", e);
  }

  const publicBase = process.env.APP_PUBLIC_URL || process.env.PUBLIC_SITE_URL || process.env.SITE_URL || process.env.URL;
  return publicBase ? `${publicBase.replace(/\/+$/, "")}/assets/sticker-preview-bg.svg` : null;
}

function escapeXml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fetchImageAsDataUrl(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar retrato gerado (${res.status})`);
  const contentType = res.headers.get("content-type") || "image/png";
  return bufferToDataUrl(await res.arrayBuffer(), contentType);
}

async function uploadFinalStickerPng(stickerId: string, svg: string) {
  const sharp = (await import(/* @vite-ignore */ "sharp")).default;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const path = `${stickerId}/figurinha.png`;
  const { error } = await supabaseAdmin.storage
    .from("stickers")
    .upload(path, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabaseAdmin.storage.from("stickers").getPublicUrl(path);
  return data.publicUrl;
}

async function composeFinalStickerSvg(input: {
  stickerId: string;
  portraitUrl: string;
  nome: string;
  stats: string;
  clube: string;
}) {
  const backgroundHref = await getStickerBackgroundHref();
  const portraitHref = await fetchImageAsDataUrl(input.portraitUrl);
  const bg = backgroundHref
    ? `<image href="${escapeXml(backgroundHref)}" x="0" y="0" width="608" height="820" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="608" height="820" fill="#58C7CF"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="608" height="820" viewBox="0 0 608 820">
  <defs>
    <clipPath id="cardClip"><rect width="608" height="820" rx="24" ry="24"/></clipPath>
    <clipPath id="playerClip"><path d="M54 46 H554 V690 H54 Z"/></clipPath>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#002776" flood-opacity=".22"/></filter>
  </defs>
  <g clip-path="url(#cardClip)">
    ${bg}
    <g clip-path="url(#playerClip)" filter="url(#softShadow)">
      <image href="${escapeXml(portraitHref)}" x="58" y="48" width="492" height="640" preserveAspectRatio="xMidYMin slice"/>
    </g>
    <rect x="30" y="681" width="548" height="75" rx="22" fill="#1C8C93"/>
    <text x="54" y="720" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="900">${escapeXml(input.nome)}</text>
    <text x="54" y="744" fill="#EAF7F8" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="500">${escapeXml(input.stats)}</text>
    <rect x="106" y="766" width="396" height="40" rx="12" fill="#147A82"/>
    <text x="304" y="791" text-anchor="middle" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" letter-spacing=".5">${escapeXml(input.clube)}</text>
  </g>
</svg>`;

  return uploadFinalStickerPng(input.stickerId, svg);
}

export async function generateStickerImageForRow(stickerId: string, status: "generated" | "paid" = "generated") {
  const { data: sticker, error } = await supabaseAdmin
    .from("stickers")
    .select("id, nome, clube, data_nascimento, altura_cm, peso_kg, foto_original_path")
    .eq("id", stickerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!sticker) throw new Error("Figurinha não encontrada");
  if (!sticker.foto_original_path) throw new Error("Foto original não encontrada");

  const { data: photo, error: downloadError } = await supabaseAdmin.storage
    .from("user-photos")
    .download(sticker.foto_original_path);
  if (downloadError || !photo) throw new Error(downloadError?.message || "Falha ao baixar foto original");

  const figurinhaUrl = await generateFigurinha({
    nome: sticker.nome,
    clube: sticker.clube,
    foto_base64: await blobToDataUrl(photo),
    stickerId,
    data_nascimento: sticker.data_nascimento,
    altura_cm: sticker.altura_cm,
    peso_kg: sticker.peso_kg,
  });

  await supabaseAdmin
    .from("stickers")
    .update({ figurinha_url: figurinhaUrl, preview_url: figurinhaUrl, status })
    .eq("id", stickerId);

  return figurinhaUrl;
}

export async function generateMissingStickersForOrder(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("Pedido não encontrado");

  const { data: stickers, error } = await supabaseAdmin
    .from("stickers")
    .select("id")
    .eq("order_id", orderId)
    .is("figurinha_url", null);
  if (error) throw new Error(error.message);

  const finalStatus = order.status === "CONFIRMED" ? "paid" : "generated";
  for (const sticker of stickers || []) {
    await generateStickerImageForRow(sticker.id, finalStatus);
  }

  return { generated: stickers?.length || 0 };
}

async function generateFigurinha({ nome, clube, foto_base64, stickerId, data_nascimento, altura_cm, peso_kg }: { nome: string; clube?: string | null; foto_base64: string; stickerId: string; data_nascimento?: string | null; altura_cm?: number | null; peso_kg?: number | null }) {
  const nascimento = data_nascimento
    ? new Date(data_nascimento).toLocaleDateString("pt-BR").replace(/\//g, "-")
    : "-";
  const altura = altura_cm ? `${(altura_cm / 100).toFixed(2).replace(".", ",")}m` : "-";
  const peso = peso_kg ? `${peso_kg}kg` : "-";
  const nomeUpper = nome.toUpperCase();
  const clubeUpper = (clube || "BRASIL").toUpperCase();

  const stats = `${nascimento} | ${altura} | ${peso}`;

  const prompt = `Create a photorealistic studio football portrait only.

INPUTS:
- Image 1 is the child reference photo.

PORTRAIT:
- Keep one centered athlete only, smiling naturally, looking directly at the camera.
- Preserve the person's recognizable facial features, skin tone, hair, eyes and natural expression from the uploaded photo.
- Preserve identity with high fidelity: same face shape, eye spacing, nose, mouth, cheeks, chin, hairline, age, expression and natural facial proportions.
- Treat this as a realistic photo edit of the uploaded child, not as creating a new child who looks similar.
- Output must look like a real high-resolution studio photograph, not an illustration.
- Keep natural skin texture, realistic hair, realistic eyes, realistic fabric and true photographic lighting.
- Do not cartoonize, caricature, repaint, draw, vectorize, stylize, smooth into plastic skin, or make it look AI-painted.
- Do not beautify into a different person, change ethnicity, change age, change face geometry, change hairstyle dramatically, change eye shape, or replace the face.
- The child should be framed from head to torso, centered, with face and Brazil jersey as the visual priority.

WARDROBE:
- The child must be wearing a Brazil national team style football uniform.
- Use a bright yellow Brazil-style jersey with green collar, green sleeve details, realistic athletic fabric, and a clean simple shield crest on the chest.
- The jersey should look like a professional Brazil selection football shirt, but avoid exact brand marks, sponsor marks, random letters, malformed badges, extra logos, or messy symbols.
- Keep the shirt visible from shoulders to torso and make it one of the main premium details of the sticker.

COMPOSITION:
- Generate only the athlete portrait.
- Do not generate any football card, sticker template, border, name bar, club bar, flag, logo, number, badge layout, typography, caption or written text.
- Keep the background plain, clean and easy to crop around the athlete.

QUALITY RULES:
- Absolutely no text or letters anywhere in the generated image.
- Keep hands out of frame if possible. Avoid distorted face, crossed eyes, extra people, bad anatomy, blurry image, pixelation, noisy background, cut-off head, broken logos, random words, watermark, illustration style, anime style, cartoon style, oil painting, 3D render, toy look, wax skin or amateur retouching.`;

  const result = await aiGenerateSticker({
    prompt,
    imageDataUrl: foto_base64,
    stickerId,
  });
  return composeFinalStickerSvg({
    stickerId,
    portraitUrl: result.publicUrl,
    nome: nomeUpper,
    stats,
    clube: clubeUpper,
  });
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
