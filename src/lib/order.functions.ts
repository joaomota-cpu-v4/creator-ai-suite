import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Resolve um id que pode ser orderId OU stickerId (compat). Retorna orderId. */
export async function resolveOrderId(id: string): Promise<string | null> {
  const { data: byOrder } = await supabaseAdmin
    .from("orders").select("id").eq("id", id).maybeSingle();
  if (byOrder) return byOrder.id;
  const { data: byStickerOrder } = await supabaseAdmin
    .from("orders").select("id").eq("sticker_id", id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (byStickerOrder) return byStickerOrder.id;
  // Stickers ainda sem order vinculado (legacy):
  const { data: sticker } = await supabaseAdmin
    .from("stickers").select("id, order_id").eq("id", id).maybeSingle();
  return sticker?.order_id ?? null;
}

/** Cria uma order DRAFT (status PENDING, sem pagamento) a partir do plano. */
export const createDraftOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ planSlug: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { data: plan, error: pe } = await supabaseAdmin
      .from("plans").select("id, quantity, price_centavos")
      .eq("slug", data.planSlug).eq("active", true).maybeSingle();
    if (pe || !plan) throw new Error("Plano indisponível");

    const { data: order, error } = await supabaseAdmin.from("orders").insert({
      sticker_id: null,
      plan_id: plan.id,
      quantity: plan.quantity,
      valor_centavos: plan.price_centavos,
      metodo: "PIX",
      status: "PENDING",
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { orderId: order.id };
  });

/** Resumo completo do pedido + figurinhas vinculadas (público). */
export const getOrderFull = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const orderId = await resolveOrderId(data.id);
    if (!orderId) throw new Error("Pedido não encontrado");
    let { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, status, metodo, valor_centavos, quantity, plan_id, pix_qr_code, pix_copy_paste, invoice_url, nome, email, cpf, telefone, printable_pack, printable_pack_url, created_at")
      .eq("id", orderId).maybeSingle();
    if (orderError) {
      console.warn("[order] printable pack fields unavailable, using fallback select", orderError.message);
      const fallback = await supabaseAdmin
        .from("orders")
        .select("id, status, metodo, valor_centavos, quantity, plan_id, pix_qr_code, pix_copy_paste, invoice_url, nome, email, cpf, telefone, created_at")
        .eq("id", orderId).maybeSingle();
      order = fallback.data ? { ...fallback.data, printable_pack: false, printable_pack_url: null } : null;
      orderError = fallback.error;
    }
    if (orderError) throw new Error(orderError.message);
    if (!order) throw new Error("Pedido não encontrado");

    const { data: plan } = order.plan_id
      ? await supabaseAdmin.from("plans").select("id, name, slug, quantity, price_centavos").eq("id", order.plan_id).maybeSingle()
      : { data: null };

    const { data: stickers } = await supabaseAdmin
      .from("stickers")
      .select("id, nome, email, status, figurinha_url, preview_url, foto_original_path, created_at")
      .eq("order_id", orderId)
      .order("created_at");

    return { order, plan, stickers: stickers || [] };
  });

/** Troca o plano de um pedido ainda PENDING (upsell). */
export const updateOrderPlan = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid(), planSlug: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from("orders").select("id, status, plan_id, quantity").eq("id", data.orderId).maybeSingle();
    if (!order) throw new Error("Pedido não encontrado");
    if (order.status !== "PENDING") throw new Error("Pedido já confirmado");

    const { data: plan } = await supabaseAdmin
      .from("plans").select("id, quantity, price_centavos").eq("slug", data.planSlug).eq("active", true).maybeSingle();
    if (!plan) throw new Error("Plano indisponível");

    // valida que o downgrade não fica abaixo do nº de stickers já gerados
    const { count } = await supabaseAdmin
      .from("stickers").select("*", { count: "exact", head: true }).eq("order_id", data.orderId);
    if ((count ?? 0) > plan.quantity) {
      throw new Error(`Você já gerou ${count} figurinhas. Escolha um plano de no mínimo ${count}.`);
    }

    const { error } = await supabaseAdmin.from("orders").update({
      plan_id: plan.id,
      quantity: plan.quantity,
      valor_centavos: plan.price_centavos,
    }).eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
