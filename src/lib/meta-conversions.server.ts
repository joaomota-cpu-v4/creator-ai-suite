import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type MetaPurchaseOrder = {
  id: string;
  email: string | null;
  telefone: string | null;
  nome: string | null;
  valor_centavos: number | null;
  meta_fbc?: string | null;
  meta_fbp?: string | null;
  meta_user_agent?: string | null;
};

function sha256(value?: string | null) {
  const clean = value?.trim().toLowerCase();
  if (!clean) return undefined;
  return crypto.createHash("sha256").update(clean).digest("hex");
}

function cleanPhone(value?: string | null) {
  const phone = value?.replace(/\D/g, "");
  if (!phone) return undefined;
  return phone.startsWith("55") ? phone : `55${phone}`;
}

function splitName(value?: string | null) {
  const parts = (value || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return {
    fn: parts[0],
    ln: parts.length > 1 ? parts[parts.length - 1] : undefined,
  };
}

async function wasEventSent(orderId: string, eventId: string) {
  const { data } = await supabaseAdmin
    .from("webhook_logs")
    .select("id")
    .eq("order_id", orderId)
    .eq("event_type", "meta_purchase")
    .contains("request_payload", { event_id: eventId })
    .eq("success", true)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function sendMetaPurchase(order: MetaPurchaseOrder, source = "server") {
  const accessToken = process.env.META_ACCESS_TOKEN || process.env.FACEBOOK_CONVERSIONS_API_TOKEN;
  const pixelId = process.env.META_PIXEL_ID || process.env.FACEBOOK_PIXEL_ID || "4001292026668330";
  if (!accessToken) {
    console.warn("[meta] META_ACCESS_TOKEN ausente; Purchase server-side nao enviado");
    return;
  }

  const eventId = `purchase-${order.id}`;
  if (await wasEventSent(order.id, eventId)) return;

  const { fn, ln } = splitName(order.nome);
  const payload = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "website",
      event_source_url: process.env.APP_PUBLIC_URL || process.env.PUBLIC_SITE_URL || process.env.SITE_URL || undefined,
      user_data: {
        em: sha256(order.email),
        ph: sha256(cleanPhone(order.telefone)),
        fn: sha256(fn),
        ln: sha256(ln),
        external_id: sha256(order.id),
        fbc: order.meta_fbc || undefined,
        fbp: order.meta_fbp || undefined,
        client_user_agent: order.meta_user_agent || undefined,
      },
      custom_data: {
        currency: "BRL",
        value: (order.valor_centavos || 0) / 100,
        content_name: "Figurinha Copa",
        order_id: order.id,
        source,
      },
    }],
  };

  let status: number | null = null;
  let text = "";
  let ok = false;
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    status = res.status;
    text = await res.text();
    ok = res.ok;
    if (!ok) console.error("[meta] Purchase CAPI failed", status, text);
  } catch (e: any) {
    text = e?.message || String(e);
    console.error("[meta] Purchase CAPI error", text);
  }

  try {
    await supabaseAdmin.from("webhook_logs").insert({
      order_id: order.id,
      event_type: "meta_purchase",
      webhook_url: "meta_conversions_api",
      request_payload: { event_id: eventId, source },
      response_status: status,
      response_body: text.slice(0, 1000),
      success: ok,
    });
  } catch (e) {
    console.error("[meta] log failed", e);
  }
}
