import { createFileRoute } from "@tanstack/react-router";
import JSZip from "jszip";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/zip/$orderId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const orderId = params.orderId;
        const { data: order } = await supabaseAdmin
          .from("orders").select("id, status").eq("id", orderId).maybeSingle();
        if (!order || order.status !== "CONFIRMED") {
          return new Response("Pedido não pago", { status: 403 });
        }
        const { data: stickers } = await supabaseAdmin
          .from("stickers").select("id, nome, figurinha_url").eq("order_id", orderId);
        if (!stickers?.length) return new Response("Nenhuma figurinha", { status: 404 });

        const zip = new JSZip();
        for (const s of stickers) {
          if (!s.figurinha_url) continue;
          try {
            const r = await fetch(s.figurinha_url);
            if (!r.ok) continue;
            const buf = await r.arrayBuffer();
            const ext = (s.figurinha_url.split(".").pop() || "png").split("?")[0].slice(0, 4);
            const safe = (s.nome || s.id).replace(/[^a-z0-9-_]/gi, "_");
            zip.file(`${safe}.${ext}`, buf);
          } catch (e) { console.error("zip fetch err", e); }
        }
        const blob = await zip.generateAsync({ type: "uint8array" });
        return new Response(blob, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="figurinhas-${orderId.slice(0,8)}.zip"`,
          },
        });
      },
    },
  },
});
