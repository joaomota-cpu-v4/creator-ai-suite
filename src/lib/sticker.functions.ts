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

function detectSupportedImageMime(bytes: Uint8Array) {
  if (bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

async function imageBytesToDataUrl(bytes: ArrayBuffer | Uint8Array) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const mime = detectSupportedImageMime(buffer);
  if (!mime) return null;
  return bufferToDataUrl(buffer, mime);
}

async function getStickerTemplateDataUrl() {
  const publicBase = process.env.APP_PUBLIC_URL || process.env.PUBLIC_SITE_URL || process.env.SITE_URL || process.env.URL;
  const candidates = ["sticker-ai-reference.png", "sticker-preview-bg.png"];
  if (publicBase) {
    for (const file of candidates) {
      try {
        const res = await fetch(`${publicBase.replace(/\/+$/, "")}/assets/${file}`);
        if (!res.ok) {
          console.warn(`[AI] sticker reference not available: ${file} (${res.status})`);
          continue;
        }
        const dataUrl = await imageBytesToDataUrl(await res.arrayBuffer());
        if (dataUrl) return dataUrl;
        console.warn(`[AI] sticker reference has unsupported image bytes: ${file}`);
      } catch (e) {
        console.warn(`[AI] sticker reference fetch failed: ${file}`, e);
      }
    }
  }

  const { readFile } = await import(/* @vite-ignore */ "node:fs/promises");
  const { join } = await import(/* @vite-ignore */ "node:path");
  for (const file of candidates) {
    try {
      const dataUrl = await imageBytesToDataUrl(await readFile(join(process.cwd(), "public", "assets", file)));
      if (dataUrl) return dataUrl;
      console.warn(`[AI] local sticker reference has unsupported image bytes: ${file}`);
    } catch (e) {
      console.warn(`[AI] local sticker reference unavailable: ${file}`, e);
    }
  }
  return null;
}

async function getStickerTemplatePngBytes() {
  const publicBase = process.env.APP_PUBLIC_URL || process.env.PUBLIC_SITE_URL || process.env.SITE_URL || process.env.URL;
  if (publicBase) {
    try {
      const res = await fetch(`${publicBase.replace(/\/+$/, "")}/assets/sticker-preview-bg.png`);
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
      console.warn("[sticker] template PNG public fetch failed", res.status, res.statusText);
    } catch (e) {
      console.warn("[sticker] template PNG public fetch failed", e);
    }
  }

  const { readFile } = await import(/* @vite-ignore */ "node:fs/promises");
  const { join } = await import(/* @vite-ignore */ "node:path");
  return readFile(join(process.cwd(), "public", "assets", "sticker-preview-bg.png"));
}

function dataUrlToBytes(dataUrl: string) {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) throw new Error("Imagem gerada em formato inválido");
  return Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0));
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function rgba(r: number, g: number, b: number, a: number) {
  return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;
}

const font5x7: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "|": ["00100", "00100", "00100", "00100", "00100", "00100", "00100"],
  ",": ["00000", "00000", "00000", "00000", "00000", "00100", "01000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};

function printableText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ,.|/()-]/g, " ");
}

function measureBlockText(text: string, scale: number) {
  const chars = printableText(text).split("");
  return Math.max(0, chars.length * 6 * scale - scale);
}

function drawBlockText(image: any, text: string, x: number, y: number, scale: number, color: number, maxWidth?: number) {
  const clean = printableText(text);
  let finalScale = scale;
  while (maxWidth && finalScale > 2 && measureBlockText(clean, finalScale) > maxWidth) finalScale -= 1;
  let cursorX = x;
  for (const char of clean) {
    const glyph = font5x7[char] || font5x7[" "];
    for (let gy = 0; gy < glyph.length; gy++) {
      for (let gx = 0; gx < glyph[gy].length; gx++) {
        if (glyph[gy][gx] !== "1") continue;
        for (let py = 0; py < finalScale; py++) {
          for (let px = 0; px < finalScale; px++) {
            image.setPixelColor(color, cursorX + gx * finalScale + px, y + gy * finalScale + py);
          }
        }
      }
    }
    cursorX += 6 * finalScale;
  }
  return { width: measureBlockText(clean, finalScale), scale: finalScale };
}

function fillRoundedRect(image: any, x: number, y: number, w: number, h: number, r: number, color: number) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const dx = px < x + r ? x + r - px : px >= x + w - r ? px - (x + w - r - 1) : 0;
      const dy = py < y + r ? y + r - py : py >= y + h - r ? py - (y + h - r - 1) : 0;
      if (dx * dx + dy * dy <= r * r) image.setPixelColor(color, px, py);
    }
  }
}

async function renderFinalStickerPng(input: {
  portraitDataUrl: string | null;
  nome: string;
  stats: string;
  clube: string;
}) {
  const { Jimp } = await import(/* @vite-ignore */ "jimp");
  const card = await Jimp.read(bytesToArrayBuffer(await getStickerTemplatePngBytes()));
  card.cover({ w: 608, h: 820 });

  const portrait = input.portraitDataUrl
    ? await Jimp.read(bytesToArrayBuffer(dataUrlToBytes(input.portraitDataUrl)))
    : new Jimp({ width: 492, height: 640, color: rgba(0, 0, 0, 0) });
  portrait.cover({ w: 492, h: 640 });
  card.composite(portrait, 58, 48);

  const mainBar = rgba(28, 140, 147, 245);
  const clubBar = rgba(20, 122, 130, 250);
  const white = rgba(255, 255, 255, 255);
  const softWhite = rgba(234, 247, 248, 255);
  const shadow = rgba(0, 39, 118, 80);

  fillRoundedRect(card, 34, 684, 540, 74, 22, shadow);
  fillRoundedRect(card, 30, 681, 548, 75, 22, mainBar);
  drawBlockText(card, input.nome, 55, 704, 7, white, 500);
  drawBlockText(card, input.stats, 55, 737, 3, softWhite, 500);

  fillRoundedRect(card, 109, 769, 390, 40, 12, shadow);
  fillRoundedRect(card, 106, 766, 396, 40, 12, clubBar);
  const clubScale = 3;
  const clubWidth = measureBlockText(input.clube, clubScale);
  drawBlockText(card, input.clube, Math.max(116, Math.round(304 - clubWidth / 2)), 780, clubScale, white, 376);

  return card.getBuffer("image/png");
}

async function uploadFinalStickerPng(stickerId: string, png: Uint8Array | Buffer) {
  const path = `${stickerId}/figurinha.png`;
  const { error } = await supabaseAdmin.storage
    .from("stickers")
    .upload(path, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabaseAdmin.storage.from("stickers").getPublicUrl(path);
  return data.publicUrl;
}

async function assertFinalStickerRendererWorks(input: { nome: string; stats: string; clube: string }) {
  await renderFinalStickerPng({
    portraitDataUrl: null,
    nome: input.nome,
    stats: input.stats,
    clube: input.clube,
  });
}

export async function renderStickerHealthPng() {
  return renderFinalStickerPng({
    portraitDataUrl: null,
    nome: "TESTE",
    stats: "Render PNG | sem IA",
    clube: "CHECKOUT VISUAL",
  });
}

async function composeFinalStickerPng(input: {
  stickerId: string;
  portraitDataUrl: string;
  nome: string;
  stats: string;
  clube: string;
}) {
  const png = await renderFinalStickerPng({
    portraitDataUrl: input.portraitDataUrl,
    nome: input.nome,
    stats: input.stats,
    clube: input.clube,
  });
  return uploadFinalStickerPng(input.stickerId, png);
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
  const styleReference = await getStickerTemplateDataUrl();
  const referenceInstructions = styleReference
    ? `- Image 2 is the exact sticker visual reference. Follow its layout, colors, composition, spacing, bars and premium printed style as closely as possible.
- Match Image 2, not a generic sticker.
- Replace only the child and the written data. Do not redesign the card.`
    : `- No visual reference image is attached. Recreate the described sticker layout as closely as possible.
- Do not create a generic card; follow the exact layout description below.`;
  const prompt = `Generate the complete final collectible football sticker as one finished PNG image.

INPUTS:
- Image 1 is the customer child photo. Use it only for the child's identity.
${referenceInstructions}

Use the child from Image 1 inside the sticker layout. Preserve the child's real face with high fidelity: same face shape, eyes, nose, mouth, cheeks, skin tone, hair, age and natural expression. The result must look like a real studio photograph, not a drawing, not a cartoon and not a 3D render.

VISUAL REFERENCE STYLE:
- Keep the same vertical 2:3 composition, deep royal blue background, large green 26 graphics, yellow block, right-side Brazil elements, top-right World Cup mark, bottom dark navy name bars and yellow Panini-style label area.
- Child centered, head and face large, shoulders wide, torso visible, occupying most of the card height like Image 2.
- Overall finish: premium printed sticker, sharp, realistic, high resolution, clean commercial product.

CHILD AND UNIFORM:
- The child must wear a Brazil national team style football jersey.
- Bright yellow shirt, green collar, green sleeve trim, realistic fabric texture.
- Add a clean Brazil-style football crest on the chest. Avoid malformed logos or random symbols.
- Keep the child photorealistic with natural skin texture, realistic hair, realistic eyes and soft studio lighting.

EXACT TEXT TO PLACE ON THE CARD:
- Main name: "${nomeUpper}"
- Stats line: "${stats}"
- Club/team line: "${clubeUpper}"

TEXT RULES:
- Text must be large, sharp, white or light gray, centered in the bottom bars, and readable.
- Do not invent extra names, numbers, words or random letters.
- If any text is difficult, prioritize the exact main name "${nomeUpper}" and stats "${stats}".

NEGATIVE RULES:
- No illustration, no anime, no cartoon, no painted look, no plastic skin, no wax face.
- Do not change the child's identity, ethnicity, age, face geometry or hairstyle dramatically.
- No extra people, no distorted eyes, no deformed face, no extra limbs, no blurry face, no low resolution.
- Do not output SVG, mockup, wireframe, template-only design, plain portrait, or photo without the full sticker layout.`;

  const result = await aiGenerateSticker({
    prompt,
    imageDataUrl: foto_base64,
    referenceImageDataUrls: styleReference ? [styleReference] : undefined,
    stickerId,
  });
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
      .select("id, status, metodo, pix_qr_code, pix_copy_paste, invoice_url, valor_centavos, printable_pack, printable_pack_url")
      .eq("id", orderId).maybeSingle();
    return order;
  });
