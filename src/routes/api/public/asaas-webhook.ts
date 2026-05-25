import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/asaas-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
          .select("sticker_id")
          .maybeSingle();

        if (paid && order?.sticker_id) {
          await supabaseAdmin.from("stickers").update({ status: "paid" }).eq("id", order.sticker_id);
          // TODO: enviar e-mail com figurinha (requer domínio configurado).
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
