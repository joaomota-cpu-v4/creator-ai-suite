import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getOrderPublic, getStickerPublic } from "@/lib/sticker.functions";
import { checkOrderStatus } from "@/lib/asaas.functions";
import { fbqTrack } from "@/lib/pixel";
import { Check, Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/sucesso/$id")({ component: Sucesso });

function Sucesso() {
  const { id } = useParams({ from: "/sucesso/$id" });
  const fetchOrder = useServerFn(getOrderPublic);
  const fetchSticker = useServerFn(getStickerPublic);
  const checkStatus = useServerFn(checkOrderStatus);

  const order = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder({ data: { stickerId: id } }),
    refetchInterval: (q) => (q.state.data?.status === "CONFIRMED" ? false : 4000),
  });
  const sticker = useQuery({ queryKey: ["sticker", id], queryFn: () => fetchSticker({ data: { id } }) });

  // Polling fallback ao Asaas direto (caso webhook não chegue)
  useEffect(() => {
    if (order.data?.status === "CONFIRMED") return;
    const t = setInterval(() => {
      checkStatus({ data: { stickerId: id } }).then((r) => {
        if (r.status === "CONFIRMED") order.refetch();
      }).catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [order.data?.status, id, checkStatus, order]);

  const confirmed = order.data?.status === "CONFIRMED";

  const purchaseFired = useRef(false);
  useEffect(() => {
    if (confirmed && !purchaseFired.current) {
      const orderId = order.data?.id;
      if (!orderId) return; // Wait until order ID is loaded

      purchaseFired.current = true;
      const valor = order.data?.valor_centavos ? order.data.valor_centavos / 100 : 12.9;
      
      fbqTrack(
        "Purchase",
        {
          value: valor,
          currency: "BRL",
          content_name: "Figurinha Copa",
          content_type: "product",
          content_ids: [id],
        },
        orderId,
        {
          email: sticker.data?.email,
          nome: sticker.data?.nome,
        }
      );
    }
  }, [confirmed, order.data, id, sticker.data]);


  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <div className="container mx-auto max-w-md px-4 py-6">
        {confirmed ? (
          <div className="rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-copa-green text-white">
              <Check className="h-8 w-8" />
            </div>
            <h1 className="mt-4 font-display text-3xl text-primary">Pagamento confirmado! 🎉</h1>
            <p className="mt-2 text-sm text-muted-foreground">Sua figurinha está pronta. Também enviamos para o seu e-mail.</p>
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
          <div className="rounded-3xl bg-white p-5 text-center shadow-2xl">
            <h1 className="font-display text-2xl text-primary">Pague o PIX para liberar</h1>
            <p className="text-xs text-muted-foreground">A liberação é automática em segundos.</p>
            {order.data.pix_qr_code ? (
              <img src={order.data.pix_qr_code} alt="QR PIX" className="mx-auto mt-4 w-52" />
            ) : order.data.invoice_url ? (
              <div className="mt-4 rounded-xl bg-secondary/30 p-4 text-xs text-muted-foreground">
                QR Code indisponível. Use o link abaixo para pagar.
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-secondary/30 p-4 text-xs text-muted-foreground">
                Gerando QR Code...
              </div>
            )}
            {order.data.pix_copy_paste && (
              <>
                <div className="mt-3 break-all rounded-lg bg-muted p-2 text-[10px] text-muted-foreground">
                  {order.data.pix_copy_paste}
                </div>
                <Button
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => {
                    navigator.clipboard.writeText(order.data!.pix_copy_paste!);
                    toast.success("Código PIX copiado");
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" /> Copiar código PIX
                </Button>
              </>
            )}
            {order.data.invoice_url && (
              <Button asChild className="mt-3 w-full bg-copa-green text-white hover:bg-copa-green/90">
                <a href={order.data.invoice_url} target="_blank" rel="noreferrer">
                  Abrir página de pagamento Asaas
                </a>
              </Button>
            )}
            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Aguardando pagamento...
            </div>
          </div>

        ) : (
          <div className="rounded-3xl bg-white p-8 text-center shadow-2xl">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">Processando seu pagamento...</p>
          </div>
        )}
      </div>
    </div>
  );
}
