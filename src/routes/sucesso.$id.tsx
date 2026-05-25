import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getOrderPublic, getStickerPublic } from "@/lib/sticker.functions";
import { Check, Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/sucesso/$id")({ component: Sucesso });

function Sucesso() {
  const { id } = useParams({ from: "/sucesso/$id" });
  const fetchOrder = useServerFn(getOrderPublic);
  const fetchSticker = useServerFn(getStickerPublic);

  const order = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder({ data: { stickerId: id } }),
    refetchInterval: (q) => (q.state.data?.status === "CONFIRMED" ? false : 4000),
  });
  const sticker = useQuery({ queryKey: ["sticker", id], queryFn: () => fetchSticker({ data: { id } }) });

  const confirmed = order.data?.status === "CONFIRMED";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <div className="container mx-auto max-w-xl px-4 py-10">
        {confirmed ? (
          <div className="rounded-3xl bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-copa-green text-white">
              <Check className="h-8 w-8" />
            </div>
            <h1 className="mt-4 font-display text-3xl text-primary">Pagamento confirmado! 🎉</h1>
            <p className="mt-2 text-muted-foreground">Sua figurinha está pronta. Também enviamos para o seu e-mail.</p>
            {sticker.data?.figurinha_url && (
              <>
                <img src={sticker.data.figurinha_url} alt="figurinha" className="mx-auto mt-6 w-full max-w-xs rounded-2xl shadow-xl" />
                <Button asChild className="mt-4 bg-primary">
                  <a href={sticker.data.figurinha_url} download target="_blank" rel="noreferrer">
                    <Download className="mr-2 h-4 w-4" /> Baixar figurinha
                  </a>
                </Button>
              </>
            )}
          </div>
        ) : order.data?.metodo === "PIX" ? (
          <div className="rounded-3xl bg-white p-6 text-center shadow-2xl">
            <h1 className="font-display text-3xl text-primary">Pague o PIX para liberar</h1>
            <p className="text-sm text-muted-foreground">A liberação é automática.</p>
            {order.data.pix_qr_code && <img src={order.data.pix_qr_code} alt="QR PIX" className="mx-auto mt-4 w-56" />}
            {order.data.pix_copy_paste && (
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => {
                  navigator.clipboard.writeText(order.data!.pix_copy_paste!);
                  toast.success("Código PIX copiado");
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Copiar código PIX
              </Button>
            )}
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Aguardando pagamento...
            </div>
          </div>
        ) : (
          <div className="rounded-3xl bg-white p-8 text-center shadow-2xl">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-2 text-muted-foreground">Processando seu pagamento...</p>
          </div>
        )}
      </div>
    </div>
  );
}
