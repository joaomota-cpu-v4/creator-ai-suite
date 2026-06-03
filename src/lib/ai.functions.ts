import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Acesso negado");
}

export const getAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { data: settings } = await supabaseAdmin
      .from("app_settings").select("ai_provider, ai_fallback").eq("id", true).maybeSingle();

    const provider = (settings?.ai_provider || "GEMINI") as "OPENAI" | "GEMINI";
    const fallback = settings?.ai_fallback ?? true;

    const { data: last } = await supabaseAdmin
      .from("ai_logs").select("provider, model, success, duration_ms, fallback_used, error, created_at")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: errors24h } = await supabaseAdmin
      .from("ai_logs").select("*", { count: "exact", head: true })
      .eq("success", false).gte("created_at", since);
    const { count: ok24h } = await supabaseAdmin
      .from("ai_logs").select("*", { count: "exact", head: true })
      .eq("success", true).gte("created_at", since);

    return {
      provider, fallback,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasGeminiKey: !!(process.env.GEMINI_API_KEY || process.env.LOVABLE_API_KEY),
      last, errors24h: errors24h ?? 0, ok24h: ok24h ?? 0,
    };
  });

export const setAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    provider: z.enum(["OPENAI", "GEMINI"]),
    fallback: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const patch: any = { ai_provider: data.provider };
    if (typeof data.fallback === "boolean") patch.ai_fallback = data.fallback;
    const { error } = await supabaseAdmin.from("app_settings").update(patch).eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAiLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { data: rows } = await supabaseAdmin
      .from("ai_logs")
      .select("id, sticker_id, provider, model, success, duration_ms, fallback_used, error, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    return rows || [];
  });
