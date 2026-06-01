import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deliverSticker } from "@/lib/delivery.server";

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
        const failed = ["PAYMENT_REFUNDED", "PAYMENT_DELETED", "PAYMENT_REFUND_DENIED", "PAYMENT_CHARGEBACK_REQUESTED"].includes(event);
        const newStatus = paid ? "CONFIRMED" : failed ? "FAILED" : null;
        if (!newStatus) return new Response("ok", { status: 200 });

        const { data: order } = await supabaseAdmin
          .from("orders")
          .update({ status: newStatus })
          .eq("asaas_payment_id", payment.id)
          .select("id, sticker_id")
          .maybeSingle();

        if (paid && order?.sticker_id) {
          await supabaseAdmin.from("stickers").update({ status: "paid" }).eq("id", order.sticker_id);
          console.log("[webhook] pagamento confirmado", order.id);
          deliverSticker(order.id).catch((e) => console.error("[delivery] async err", e));
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
