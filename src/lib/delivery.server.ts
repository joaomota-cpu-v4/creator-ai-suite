import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Entrega automática da figurinha após pagamento confirmado.
 * Idempotente: marca delivered_at e só executa uma vez por order.
 * - Envia webhook externo (WEBHOOK_URL)
 * - Envia e-mail com a figurinha (RESEND_API_KEY + EMAIL_FROM)
 * Erros não interrompem o fluxo — apenas loggam.
 */
export async function deliverSticker(orderId: string) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id, sticker_id, status, nome, email, telefone, delivered_at, created_at")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    console.error("[delivery] pedido não encontrado", orderId, error);
    return;
  }
  if (order.delivered_at) {
    console.log("[delivery] já entregue, pulando", orderId);
    return;
  }
  if (order.status !== "CONFIRMED") {
    console.log("[delivery] pedido não confirmado, status=", order.status);
    return;
  }

  const { data: sticker } = await supabaseAdmin
    .from("stickers")
    .select("id, nome, email, figurinha_url, preview_url")
    .eq("id", order.sticker_id)
    .maybeSingle();

  if (!sticker) {
    console.error("[delivery] sticker não encontrado", order.sticker_id);
    return;
  }

  const imageUrl = sticker.figurinha_url || sticker.preview_url;
  const nome = order.nome || sticker.nome;
  const email = order.email || sticker.email;

  console.log("[delivery] iniciando entrega", { orderId, stickerId: sticker.id, email, imageUrl: !!imageUrl });

  // Marca entregue imediatamente (evita duplo envio se chamado em paralelo)
  await supabaseAdmin
    .from("orders")
    .update({ delivered_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("delivered_at", null);

  // 1) Webhook externo
  const webhookUrl = process.env.WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "purchase",
          order_id: order.id,
          sticker_id: sticker.id,
          status: "paid",
          nome,
          email,
          telefone: order.telefone,
          image_url: imageUrl,
          created_at: order.created_at,
        }),
      });
      console.log("[delivery] webhook enviado", res.status);
    } catch (e) {
      console.error("[delivery] erro no webhook", e);
    }
  } else {
    console.log("[delivery] WEBHOOK_URL não configurado, pulando");
  }

  // 2) E-mail via Resend
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (resendKey && from && email && imageUrl) {
    try {
      const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#FFD23F;border-radius:16px">
  <h1 style="color:#002776;text-align:center">⚽ Sua figurinha chegou, ${nome}!</h1>
  <p style="color:#002776;text-align:center">Pagamento confirmado. Obrigado pela compra!</p>
  <div style="background:white;border-radius:12px;padding:16px;text-align:center;margin:16px 0">
    <img src="${imageUrl}" alt="figurinha" style="max-width:100%;border-radius:8px"/>
  </div>
  <p style="text-align:center">
    <a href="${imageUrl}" style="display:inline-block;background:#009C3B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">📥 Baixar figurinha em alta qualidade</a>
  </p>
  <p style="color:#002776;text-align:center;font-size:12px;margin-top:24px">Figurinha da Copa — feito com carinho 💛💚</p>
</div>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "🏆 Sua figurinha da Copa está pronta!",
          html,
        }),
      });
      const txt = await res.text();
      console.log("[delivery] e-mail enviado", res.status, txt.slice(0, 200));
    } catch (e) {
      console.error("[delivery] erro no e-mail", e);
    }
  } else {
    console.log("[delivery] e-mail pulado", { hasResend: !!resendKey, hasFrom: !!from, hasEmail: !!email });
  }
}
