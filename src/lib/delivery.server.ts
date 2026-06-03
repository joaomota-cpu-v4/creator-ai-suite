import { createHmac } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Entrega automática (idempotente) para um pedido CONFIRMED.
 * - busca todas as stickers do pedido
 * - dispara webhook (com HMAC) e registra em webhook_logs
 * - envia e-mail (Resend) com todas as figurinhas
 */
export async function deliverOrder(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, status, metodo, asaas_payment_id, valor_centavos, nome, email, telefone, cpf, delivered_at, created_at, updated_at, quantity, plan_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return console.error("[delivery] pedido não encontrado", orderId);
  if (order.delivered_at) return console.log("[delivery] já entregue", orderId);
  if (order.status !== "CONFIRMED") return console.log("[delivery] não confirmado", orderId);

  const { data: stickers } = await supabaseAdmin
    .from("stickers")
    .select("id, nome, email, figurinha_url, preview_url")
    .eq("order_id", orderId);

  const { data: plan } = order.plan_id
    ? await supabaseAdmin.from("plans").select("name, slug, quantity").eq("id", order.plan_id).maybeSingle()
    : { data: null };

  await supabaseAdmin.from("orders").update({ delivered_at: new Date().toISOString() })
    .eq("id", orderId).is("delivered_at", null);

  const payload = buildDeliveryPayload(order, plan, stickers || []);

  await sendWebhook(orderId, payload);
  await sendEmail(order, plan, stickers || []);
}

function getPublicBaseUrl() {
  const raw =
    process.env.APP_PUBLIC_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.URL;
  return raw ? raw.replace(/\/+$/, "") : null;
}

function moneyBRL(cents: number | null | undefined) {
  return Number(((cents || 0) / 100).toFixed(2));
}

export function buildDeliveryPayload(order: any, plan: any, stickers: any[], event = "purchase") {
  const baseUrl = getPublicBaseUrl();
  const imageStickers = stickers.map((s) => {
    const imageUrl = s.figurinha_url || s.preview_url || null;
    return {
      sticker_id: s.id,
      nome: s.nome,
      email: s.email || order.email || null,
      status: s.status || null,
      image_url: imageUrl,
      download_url: imageUrl,
      preview_url: s.preview_url || null,
    };
  });

  return {
    event,
    order_id: order.id,
    status: order.status === "CONFIRMED" ? "paid" : order.status?.toLowerCase(),
    paid: order.status === "CONFIRMED",
    payment_status: order.status,
    payment_method: order.metodo || null,
    asaas_payment_id: order.asaas_payment_id || null,
    value_centavos: order.valor_centavos || 0,
    value_brl: moneyBRL(order.valor_centavos),
    customer: {
      name: order.nome || null,
      email: order.email || null,
      phone: order.telefone || null,
      cpf: order.cpf || null,
    },
    plan_slug: plan?.slug || null,
    plan_name: plan?.name || null,
    plan: {
      slug: plan?.slug || null,
      name: plan?.name || null,
      quantity: plan?.quantity || order.quantity || stickers.length,
    },
    quantity: order.quantity || stickers.length,
    generated_count: imageStickers.length,
    nome: order.nome,
    email: order.email,
    telefone: order.telefone,
    download: {
      zip_url: baseUrl ? `${baseUrl}/api/zip/${order.id}` : null,
      success_url: baseUrl ? `${baseUrl}/sucesso/${order.id}` : null,
    },
    stickers: imageStickers,
    created_at: order.created_at,
    updated_at: order.updated_at || null,
  };
}

async function sign(body: string): Promise<string | null> {
  let secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    const { data } = await supabaseAdmin.from("app_settings").select("webhook_secret").eq("id", true).maybeSingle();
    secret = data?.webhook_secret || undefined;
  }
  if (!secret) return null;
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

export async function sendWebhook(orderId: string, payload: any, opts?: { existingLogId?: string }) {
  const url = process.env.WEBHOOK_URL;
  if (!url) {
    console.log("[delivery] WEBHOOK_URL não configurado");
    return { skipped: true };
  }

  const body = JSON.stringify(payload);
  const signature = await sign(body);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature) headers["X-Webhook-Signature"] = signature;

  let status = 0; let respText = ""; let ok = false;
  try {
    const res = await fetch(url, { method: "POST", headers, body });
    status = res.status;
    respText = (await res.text()).slice(0, 1000);
    ok = res.ok;
  } catch (e: any) {
    respText = "fetch error: " + (e?.message || String(e));
  }

  if (opts?.existingLogId) {
    const { data: prev } = await supabaseAdmin.from("webhook_logs").select("attempts").eq("id", opts.existingLogId).maybeSingle();
    const attempts = (prev?.attempts ?? 0) + 1;
    await supabaseAdmin.from("webhook_logs").update({
      response_status: status, response_body: respText, success: ok,
      attempts, last_attempt_at: new Date().toISOString(),
      next_retry_at: ok ? null : nextRetryAt(attempts),
    }).eq("id", opts.existingLogId);
  } else {
    await supabaseAdmin.from("webhook_logs").insert({
      order_id: orderId, event_type: payload.event || "purchase",
      webhook_url: url, request_payload: payload,
      response_status: status, response_body: respText, success: ok,
      attempts: 1, next_retry_at: ok ? null : nextRetryAt(1),
    });
  }

  console.log("[webhook]", ok ? "✅" : "❌", status, orderId);
  return { ok, status };
}

function nextRetryAt(attempt: number): string | null {
  const minutes = [1, 5, 15, 60, 240]; // 1m, 5m, 15m, 1h, 4h
  if (attempt >= minutes.length + 1) return null; // máx 5 tentativas
  const m = minutes[attempt - 1];
  return new Date(Date.now() + m * 60_000).toISOString();
}

async function sendEmail(order: any, plan: any, stickers: any[]) {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const email = order.email;
  if (!resendKey || !from || !email || !stickers.length) {
    console.log("[email] pulado", { hasResend: !!resendKey, hasFrom: !!from, hasEmail: !!email, n: stickers.length });
    return;
  }
  try {
    const items = stickers.map((s) => `
      <div style="background:white;border-radius:12px;padding:14px;text-align:center;margin:12px 0">
        <img src="${s.figurinha_url || s.preview_url}" alt="${s.nome}" style="max-width:100%;border-radius:8px"/>
        <p style="color:#002776;margin:8px 0 4px"><b>${s.nome}</b></p>
        <a href="${s.figurinha_url || s.preview_url}" style="display:inline-block;background:#009C3B;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px">📥 Baixar</a>
      </div>`).join("");

    const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#FFD23F;border-radius:16px">
  <h1 style="color:#002776;text-align:center">⚽ ${stickers.length > 1 ? "Suas figurinhas chegaram" : "Sua figurinha chegou"}, ${order.nome || ""}!</h1>
  <p style="color:#002776;text-align:center">Pagamento confirmado${plan ? ` — plano <b>${plan.name}</b>` : ""}.</p>
  ${items}
  <p style="color:#002776;text-align:center;font-size:12px;margin-top:24px">Figurinha da Copa 💛💚</p>
</div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [email],
        subject: stickers.length > 1 ? `🏆 Suas ${stickers.length} figurinhas estão prontas!` : "🏆 Sua figurinha está pronta!",
        html,
      }),
    });
    console.log("[email]", res.status);
  } catch (e) { console.error("[email] erro", e); }
}

/** Compat com chamadas antigas. */
export async function deliverSticker(orderId: string) { return deliverOrder(orderId); }
