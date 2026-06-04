import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getOrderFull } from "@/lib/order.functions";
import { checkOrderStatus } from "@/lib/asaas.functions";
import { fbqTrack } from "@/lib/pixel";
import { Check, Copy, Download, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import JSZip from "jszip";

export const Route = createFileRoute("/sucesso/$id")({ component: Sucesso });

function Sucesso() {
  const { id } = useParams({ from: "/sucesso/$id" });
  const fetchOrder = useServerFn(getOrderFull);
  const checkStatus = useServerFn(checkOrderStatus);
  const [zipping, setZipping] = useState(false);

  const orderQ = useQuery({
    queryKey: ["order-full", id],
    queryFn: () => fetchOrder({ data: { id } }),
    refetchInterval: (q) => (q.state.data?.order.status === "CONFIRMED" ? false : 4000),
  });

  useEffect(() => {
    if (orderQ.data?.order.status === "CONFIRMED") return;
    const t = setInterval(() => {
      checkStatus({ data: { id } }).then((r) => { if (r.status === "CONFIRMED") orderQ.refetch(); }).catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [orderQ.data?.order.status, id, checkStatus, orderQ]);

  const order = orderQ.data?.order;
  const stickers = orderQ.data?.stickers || [];
  const plan = orderQ.data?.plan;
  const confirmed = order?.status === "CONFIRMED";

  const purchaseFired = useRef(false);
  useEffect(() => {
    if (confirmed && !purchaseFired.current) {
      const purchaseKey = `purchase-fired:${order?.id || id}`;
      if (typeof window !== "undefined" && window.localStorage.getItem(purchaseKey)) return;
      purchaseFired.current = true;
      if (typeof window !== "undefined") window.localStorage.setItem(purchaseKey, "1");
      fbqTrack("Purchase", {
        value: (order?.valor_centavos || 0) / 100,
        currency: "BRL", content_name: plan?.name || "Figurinha Copa",
      }, {
        email: order?.email,
        phone: order?.telefone,
        name: order?.nome,
        externalId: order?.id,
      });
    }
  }, [confirmed, id, order?.email, order?.id, order?.nome, order?.telefone, order?.valor_centavos, plan?.name]);

  const downloadZip = async () => {
    setZipping(true);
    try {
      const zip = new JSZip();
      for (const s of stickers) {
        if (!s.figurinha_url) continue;
        const r = await fetch(s.figurinha_url);
        const buf = await r.arrayBuffer();
        const ext = (s.figurinha_url.split(".").pop() || "png").split("?")[0].slice(0, 4);
        const safe = (s.nome || s.id).replace(/[^a-z0-9-_]/gi, "_");
        zip.file(`${safe}.${ext}`, buf);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `figurinhas-${(order?.id || "").slice(0,8)}.zip`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error("Falha ao gerar ZIP: " + e.message);
    } finally { setZipping(false); }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <div className="container mx-auto max-w-3xl px-4 py-6">
        {confirmed ? (
          <div className="rounded-3xl bg-white p-6 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-copa-green text-white">
                <Check className="h-8 w-8"/>
              </div>
              <h1 className="mt-4 font-display text-3xl text-primary">Pagamento confirmado! 🎉</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Plano <b>{plan?.name}</b> · {stickers.length} figurinha(s). Também enviamos por e-mail.
              </p>
              {stickers.length > 1 && (
                <Button onClick={downloadZip} disabled={zipping} className="mt-4 bg-primary">
                  {zipping ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Empacotando...</> : <><Package className="mr-2 h-4 w-4"/>Baixar todas (ZIP)</>}
                </Button>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {stickers.map((s) => (
                <div key={s.id} className="text-center">
                  {s.figurinha_url ? (
                    <>
                      <img src={s.figurinha_url} alt={s.nome} className="aspect-[3/4] w-full rounded-2xl object-cover shadow-xl"/>
                      <Button asChild size="sm" variant="outline" className="mt-2 w-full">
                        <a href={s.figurinha_url} download target="_blank" rel="noreferrer">
                          <Download className="mr-1 h-3 w-3"/>{s.nome}
                        </a>
                      </Button>
                    </>
                  ) : <Loader2 className="h-6 w-6 animate-spin"/>}
                </div>
              ))}
            </div>
          </div>
        ) : order?.metodo === "PIX" ? (
          <div className="mx-auto max-w-md rounded-3xl bg-white p-5 text-center shadow-2xl">
            <h1 className="font-display text-2xl text-primary">Pague o PIX para liberar</h1>
            <p className="text-xs text-muted-foreground">Liberação automática.</p>
            {order.pix_qr_code ? <img src={order.pix_qr_code} alt="QR PIX" className="mx-auto mt-4 w-52"/> : <div className="mt-4 rounded-xl bg-secondary/30 p-4 text-xs">Gerando QR...</div>}
            {order.pix_copy_paste && (
              <>
                <div className="mt-3 break-all rounded-lg bg-muted p-2 text-[10px]">{order.pix_copy_paste}</div>
                <Button variant="outline" className="mt-3 w-full" onClick={() => { navigator.clipboard.writeText(order.pix_copy_paste!); toast.success("Copiado"); }}>
                  <Copy className="mr-2 h-4 w-4"/>Copiar PIX
                </Button>
              </>
            )}
            {order.invoice_url && (
              <Button asChild className="mt-3 w-full bg-copa-green text-white"><a href={order.invoice_url} target="_blank" rel="noreferrer">Abrir página de pagamento</a></Button>
            )}
            <div className="mt-5 flex items-center justify-center gap-2 text-xs"><Loader2 className="h-4 w-4 animate-spin"/>Aguardando pagamento...</div>
          </div>
        ) : (
          <div className="mx-auto max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary"/>
            <p className="mt-2 text-sm">Processando seu pagamento...</p>
          </div>
        )}
      </div>
    </div>
  );
}
