import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Acesso negado");
}

export const adminListOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, metodo, valor_centavos, created_at, asaas_payment_id, sticker_id, nome, email, telefone, cpf, quantity, plans(name, slug), stickers(nome, email, figurinha_url, status)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const orderIds = (data || []).map((o) => o.id);
    const { data: stickerRows } = orderIds.length
      ? await supabaseAdmin
          .from("stickers")
          .select("id, order_id, nome, email, figurinha_url, status, created_at")
          .in("order_id", orderIds)
          .order("created_at", { ascending: true })
      : { data: [] };

    const stickersByOrder = new Map<string, any[]>();
    for (const sticker of stickerRows || []) {
      if (!sticker.order_id) continue;
      const list = stickersByOrder.get(sticker.order_id) || [];
      list.push(sticker);
      stickersByOrder.set(sticker.order_id, list);
    }

    return (data || []).map((order) => {
      const stickerList = stickersByOrder.get(order.id) || [];
      return {
        ...order,
        sticker_list: stickerList,
        sticker_count: stickerList.length,
        first_sticker: stickerList[0] || order.stickers || null,
      };
    });
  });

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const [{ count: total }, { count: paid }, { data: revRows }] = await Promise.all([
      supabaseAdmin.from("orders").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("*", { count: "exact", head: true }).eq("status", "CONFIRMED"),
      supabaseAdmin.from("orders").select("valor_centavos").eq("status", "CONFIRMED"),
    ]);
    const revenue = (revRows || []).reduce((s, r: any) => s + (r.valor_centavos || 0), 0);
    return { total: total ?? 0, paid: paid ?? 0, revenueCents: revenue };
  });

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    // First user becomes admin if no admin exists
    const { data: existing } = await supabaseAdmin.from("user_roles").select("id").eq("role", "admin").limit(1).maybeSingle();
    if (existing) {
      const { data: mine } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
      if (!mine) throw new Error("Já existe um admin. Peça para te adicionar.");
      return { ok: true };
    }
    await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "admin" });
    return { ok: true };
  });

export const isAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    return { admin: !!data };
  });
