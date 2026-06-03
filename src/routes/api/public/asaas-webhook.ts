import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deliverSticker } from "@/lib/delivery.server";
import { generateMissingStickersForOrder } from "@/lib/sticker.functions";

export const Route = createFileRoute("/api/public/asaas-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Validação do token configurado no painel Asaas (header asaas-access-token)
        const expected = process.env.ASAAS_WEBHOOK_TOKEN;
        if (expected) {
          const got = request.headers.get("asaas-access-token") || request.headers.get("Asaas-Access-Token");
          if (got !== expected) {
            console.warn("Webhook token inválido");
            return new Response("invalid token", { status: 401 });
          }
        }

        const body = await request.json().catch(() => ({} as any));
        const event = body?.event as string | undefined;
        const payment = body?.payment;
        if (!event || !payment?.id) return new Response("ignored", { status: 200 });

        const paid = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_RECEIVED_IN_CASH"].includes(event);
        const refunded = event === "PAYMENT_REFUNDED";
        const failed = ["PAYMENT_DELETED", "PAYMENT_OVERDUE", "PAYMENT_REFUND_DENIED", "PAYMENT_CHARGEBACK_REQUESTED"].includes(event);
        const newStatus = paid ? "CONFIRMED" : refunded ? "REFUNDED" : failed ? "FAILED" : null;
        if (!newStatus) return new Response("ok", { status: 200 });

        console.log("[asaas-webhook] recebido", {
          event,
          paymentId: payment.id,
          externalReference: payment.externalReference,
          newStatus,
        });

        let { data: order } = await supabaseAdmin
          .from("orders")
          .update({ status: newStatus, asaas_payment_id: payment.id })
          .eq("asaas_payment_id", payment.id)
          .select("id")
          .maybeSingle();

        if (!order?.id && payment.externalReference) {
          const { data: fallbackOrder } = await supabaseAdmin
            .from("orders")
            .update({
              status: newStatus,
              asaas_payment_id: payment.id,
            })
            .eq("id", payment.externalReference)
            .select("id")
            .maybeSingle();
          order = fallbackOrder;
        }

        if (!order?.id) {
          console.warn("[webhook] pagamento sem pedido correspondente", {
            paymentId: payment.id,
            externalReference: payment.externalReference,
            event,
          });
        }

        if (paid && order?.id) {
          await generateMissingStickersForOrder(order.id);
          await supabaseAdmin.from("stickers").update({ status: "paid" }).eq("order_id", order.id);
          console.log("[webhook] pagamento confirmado", order.id);
          deliverSticker(order.id).catch((e) => console.error("[delivery] async err", e));
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
