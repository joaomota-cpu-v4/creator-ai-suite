// AI provider abstraction for sticker generation.
// Supports OPENAI and GEMINI. Chooses provider from app_settings.ai_provider
// (env AI_PROVIDER as fallback). Falls back to the other provider on failure
// when app_settings.ai_fallback is true.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ProviderName = "OPENAI" | "GEMINI";

export interface GenerateOpts {
  prompt: string;
  imageDataUrl: string; // data:image/...;base64,xxx
  referenceImageDataUrls?: string[];
  stickerId: string;
}

export interface GenerateResult {
  publicUrl: string;
  dataUrl: string;
  provider: ProviderName;
  model: string;
  durationMs: number;
  fallbackUsed: boolean;
}

async function getConfiguredProvider(): Promise<{ provider: ProviderName; fallback: boolean }> {
  const geminiEnabled = process.env.ENABLE_GEMINI === "true";
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("ai_provider, ai_fallback")
      .eq("id", true)
      .maybeSingle();
    const p = (data?.ai_provider || process.env.AI_PROVIDER || "OPENAI").toUpperCase();
    const provider = p === "GEMINI" && geminiEnabled ? "GEMINI" : "OPENAI";
    return {
      provider,
      fallback: process.env.ENABLE_AI_PROVIDER_FALLBACK === "true" && geminiEnabled ? data?.ai_fallback ?? false : false,
    };
  } catch {
    return { provider: "OPENAI", fallback: false };
  }
}

async function uploadAndPublish(stickerId: string, dataUrl: string): Promise<string> {
  const m = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) throw new Error("Bad image data");
  const ext = m[1].split("/")[1] || "png";
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  const path = `${stickerId}/figurinha.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from("stickers").upload(path, bytes, { contentType: m[1], upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabaseAdmin.storage.from("stickers").getPublicUrl(path);
  return data.publicUrl;
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const m = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) throw new Error("Bad image data");
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return new File([bytes], filename, { type: m[1] });
}

async function arrayBufferToBase64(buf: ArrayBuffer): Promise<string> {
  if (typeof Buffer !== "undefined") return Buffer.from(buf).toString("base64");
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ----- GEMINI (via Lovable AI Gateway by default; direct via GEMINI_API_KEY if set) -----
async function callGemini(opts: GenerateOpts): Promise<{ dataUrl: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY/LOVABLE_API_KEY ausente");
  const model = "google/gemini-3.1-flash-image-preview";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: [
        { type: "text", text: opts.prompt },
        { type: "image_url", image_url: { url: opts.imageDataUrl } },
        ...(opts.referenceImageDataUrls || []).map((url) => ({ type: "image_url", image_url: { url } })),
      ]}],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const parts = json?.choices?.[0]?.message?.images || json?.choices?.[0]?.message?.content;
  let dataUrl: string | null = null;
  if (Array.isArray(parts)) {
    for (const p of parts) {
      const u = p?.image_url?.url || p?.url;
      if (typeof u === "string" && u.startsWith("data:image")) { dataUrl = u; break; }
    }
  }
  if (!dataUrl) throw new Error("Gemini: sem imagem na resposta");
  return { dataUrl, model };
}

// ----- OPENAI (direct via OPENAI_API_KEY) -----
async function callOpenAI(opts: GenerateOpts): Promise<{ dataUrl: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente");
  const configuredModel = process.env.OPENAI_IMAGE_MODEL;
  const model = configuredModel || "gpt-image-1.5";
  const requestedQuality = process.env.OPENAI_IMAGE_QUALITY || "medium";
  const quality = ["low", "medium", "high", "auto"].includes(requestedQuality)
    ? requestedQuality
    : "low";
  const requestedSize = process.env.OPENAI_IMAGE_SIZE || "1024x1536";
  const size = ["1024x1024", "1024x1536", "1536x1024", "auto"].includes(requestedSize)
    ? requestedSize
    : "1024x1536";
  const buildForm = (selectedModel: string) => {
    const form = new FormData();
    form.append("model", selectedModel);
    const references = [opts.imageDataUrl, ...(opts.referenceImageDataUrls || [])];
    if (references.length > 1) {
      references.forEach((url, index) => form.append("image[]", dataUrlToFile(url, `reference-${index + 1}.png`)));
    } else {
      form.append("image", dataUrlToFile(opts.imageDataUrl, "reference.jpg"));
    }
    form.append("prompt", opts.prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("input_fidelity", "high");
    form.append("output_format", "png");
    form.append("n", "1");
    return form;
  };

  const request = (selectedModel: string) => fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: buildForm(selectedModel),
  });

  let selectedModel = model;
  let res = await request(selectedModel);
  if (!res.ok && !configuredModel && selectedModel === "gpt-image-1.5" && [400, 404].includes(res.status)) {
    const firstError = await res.text();
    if (/model|gpt-image-1\.5|not found|unsupported|access/i.test(firstError)) {
      console.warn("[AI] gpt-image-1.5 indisponivel, tentando gpt-image-1", firstError.slice(0, 300));
      selectedModel = "gpt-image-1";
      res = await request(selectedModel);
    } else {
      throw new Error(`OpenAI ${res.status}: ${firstError}`);
    }
  }
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (b64) return { dataUrl: `data:image/png;base64,${b64}`, model: selectedModel };
  const url = json?.data?.[0]?.url;
  if (typeof url === "string") {
    const image = await fetch(url);
    if (!image.ok) throw new Error(`OpenAI: falha ao baixar imagem (${image.status})`);
    const contentType = image.headers.get("content-type") || "image/png";
    const base64 = await arrayBufferToBase64(await image.arrayBuffer());
    return { dataUrl: `data:${contentType};base64,${base64}`, model: selectedModel };
  }
  throw new Error("OpenAI: sem imagem na resposta");
}

async function callProvider(provider: ProviderName, opts: GenerateOpts) {
  return provider === "OPENAI" ? callOpenAI(opts) : callGemini(opts);
}

async function logAttempt(row: {
  sticker_id: string; provider: string; model?: string | null;
  success: boolean; duration_ms: number; error?: string | null; fallback_used?: boolean;
}) {
  try { await supabaseAdmin.from("ai_logs").insert(row); } catch (e) { console.error("ai_logs insert", e); }
}

export async function generateSticker(opts: GenerateOpts): Promise<GenerateResult> {
  const { provider: primary, fallback } = await getConfiguredProvider();
  const secondary: ProviderName = primary === "OPENAI" ? "GEMINI" : "OPENAI";

  const tryOne = async (p: ProviderName, isFallback: boolean) => {
    const start = Date.now();
    try {
      const { dataUrl, model } = await callProvider(p, opts);
      const publicUrl = await uploadAndPublish(opts.stickerId, dataUrl);
      const durationMs = Date.now() - start;
      console.log(`[AI] provider=${p} model=${model} ok in ${durationMs}ms fallback=${isFallback}`);
      await logAttempt({ sticker_id: opts.stickerId, provider: p, model, success: true, duration_ms: durationMs, fallback_used: isFallback });
      return { publicUrl, dataUrl, provider: p, model, durationMs, fallbackUsed: isFallback };
    } catch (e: any) {
      const durationMs = Date.now() - start;
      const msg = e?.message || String(e);
      console.error(`[AI] provider=${p} FAIL in ${durationMs}ms: ${msg}`);
      await logAttempt({ sticker_id: opts.stickerId, provider: p, success: false, duration_ms: durationMs, error: msg, fallback_used: isFallback });
      throw e;
    }
  };

  try {
    return await tryOne(primary, false);
  } catch (e) {
    if (!fallback) throw e;
    console.warn(`[AI] fallback acionado: ${primary} -> ${secondary}`);
    return await tryOne(secondary, true);
  }
}
