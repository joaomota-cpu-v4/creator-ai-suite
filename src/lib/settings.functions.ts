import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getPrice = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("price_centavos")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { price_centavos: data?.price_centavos ?? 1290 };
});

export const setPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ price_centavos: z.number().int().min(100).max(1000000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Acesso negado");

    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ id: true, price_centavos: data.price_centavos, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true, price_centavos: data.price_centavos };
  });
