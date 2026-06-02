import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deliverOrder, sendWebhook } from "./delivery.server";

async function ensureAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Acesso negado");
}

export const listWebhookLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ filter: z.enum(["all", "success", "failed"]).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    let q = supabaseAdmin.from("webhook_logs")
      .select("id, order_id, event_type, webhook_url, response_status, success, attempts, last_attempt_at, created_at, orders(nome, email)")
      .order("created_at", { ascending: false }).limit(200);
    if (data.filter === "success") q = q.eq("success", true);
    if (data.filter === "failed") q = q.eq("success", false);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows || [];
  });

export const resendWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    // Reconstrói o payload (mesmo lógica do deliverOrder mas força o envio)
    const { data: order } = await supabaseAdmin
      .from("orders").select("*").eq("id", data.orderId).maybeSingle();
    if (!order) throw new Error("Pedido não encontrado");
    const { data: stickers } = await supabaseAdmin.from("stickers")
      .select("id, nome, figurinha_url, preview_url").eq("order_id", data.orderId);
    const { data: plan } = order.plan_id
      ? await supabaseAdmin.from("plans").select("name, slug, quantity").eq("id", order.plan_id).maybeSingle()
      : { data: null };

    const payload = {
      event: "purchase",
      order_id: order.id,
      status: order.status === "CONFIRMED" ? "paid" : order.status?.toLowerCase(),
      plan: plan?.slug || null,
      plan_name: plan?.name || null,
      quantity: order.quantity,
      nome: order.nome, email: order.email, telefone: order.telefone,
      stickers: (stickers || []).map((s) => ({ sticker_id: s.id, nome: s.nome, image_url: s.figurinha_url || s.preview_url })),
      created_at: order.created_at,
    };
    return sendWebhook(order.id, payload);
  });

export const resendAllFailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ withinDays: z.number().int().min(1).max(365).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const since = data.withinDays
      ? new Date(Date.now() - data.withinDays * 86400_000).toISOString()
      : new Date(0).toISOString();
    const { data: logs } = await supabaseAdmin
      .from("webhook_logs").select("order_id").eq("success", false).gte("created_at", since);
    const uniq = Array.from(new Set((logs || []).map((l) => l.order_id).filter(Boolean) as string[]));
    let ok = 0, fail = 0;
    for (const oid of uniq) {
      try {
        const r = await deliverOrder(oid).catch(() => null);
        ok++; void r;
      } catch { fail++; }
    }
    return { tried: uniq.length, ok, fail };
  });

export const testWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const url = process.env.WEBHOOK_URL;
    if (!url) return { url: null, status: null, ok: false, body: "WEBHOOK_URL não configurado", ms: 0 };
    const start = Date.now();
    const payload = { event: "test", order_id: "test", status: "ok", timestamp: new Date().toISOString() };
    const r = await sendWebhook("00000000-0000-0000-0000-000000000000", payload);
    return { url, status: r.status ?? null, ok: !!r.ok, body: "Veja webhook_logs", ms: Date.now() - start };
  });
