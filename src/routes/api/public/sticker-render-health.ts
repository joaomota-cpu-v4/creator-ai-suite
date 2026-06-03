import { createFileRoute } from "@tanstack/react-router";
import { renderStickerHealthPng } from "@/lib/sticker.functions";

export const Route = createFileRoute("/api/public/sticker-render-health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const png = await renderStickerHealthPng();
          return new Response(png, {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "no-store",
            },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("[sticker-render-health] failed", e);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
