import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getOrderFull, updateOrderPlan } from "@/lib/order.functions";
import { listActivePlans } from "@/lib/plans.functions";
import { fbqTrack } from "@/lib/pixel";
import { formatBRL } from "@/lib/price";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/oferta/$id")({ component: Oferta });

function Oferta() {
  const { id } = useParams({ from: "/oferta/$id" });
  const navigate = useNavigate();
  const fetchOrder = useServerFn(getOrderFull);
  const fetchPlans = useServerFn(listActivePlans);
  const swapPlan = useServerFn(updateOrderPlan);

  const orderQ = useQuery({
    queryKey: ["order-full", id],
    queryFn: () => fetchOrder({ data: { id } }),
    refetchInterval: (q) => {
      const stickers = q.state.data?.stickers || [];
      return stickers.every((s) => s.status === "generated" || s.status === "paid") ? false : 3000;
    },
  });
  const plansQ = useQuery({ queryKey: ["plans"], queryFn: () => fetchPlans() });

  useEffect(() => {
    if (orderQ.data?.order.valor_centavos) {
      fbqTrack("InitiateCheckout", { value: orderQ.data.order.valor_centavos / 100, currency: "BRL" });
    }
  }, [orderQ.data?.order.valor_centavos]);

  const order = orderQ.data?.order;
  const plan = orderQ.data?.plan;
  const stickers = orderQ.data?.stickers || [];
  const orderId = order?.id || id;
  const remaining = Math.max(0, (order?.quantity || 0) - stickers.length);
  const hasRemaining = remaining > 0;
  const readyToPay = Boolean(order)
    && !hasRemaining
    && stickers.length > 0
    && stickers.every((sticker) => (
      ["generated", "paid", "delivered"].includes(sticker.status)
      && Boolean(sticker.preview_url || sticker.figurinha_url)
    ));

  const upgrade = async (slug: string) => {
    try {
      await swapPlan({ data: { orderId, planSlug: slug } });
      toast.success("Plano atualizado!");
      orderQ.refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  const otherPlans = (plansQ.data || []).filter((p) => p.slug !== plan?.slug && p.quantity >= stickers.length);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <div className="container mx-auto max-w-4xl px-4 py-6 md:py-10">
        <h1 className="text-center font-display text-3xl text-primary md:text-5xl">
          {stickers.length > 1 ? "Suas figurinhas estão prontas!" : "Sua figurinha está pronta!"} 🏆
        </h1>

        {/* Grid de figurinhas com blur */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {stickers.map((s) => (
            <div key={s.id} className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-white shadow-xl">
              {s.preview_url ? (
                <>
                  <img src={s.preview_url} className="h-full w-full object-cover" alt={s.nome}/>
                  <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/80"/>
                  <div className="absolute inset-0 flex items-end justify-center p-2">
                    <span className="rounded-full bg-copa-green px-2 py-0.5 text-[10px] font-bold text-white">🔒 LIBERAR</span>
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary"/></div>
              )}
            </div>
          ))}
        </div>

        {/* Card de preço */}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <div className="text-sm text-muted-foreground">Plano <b>{plan?.name}</b></div>
            <div className="font-display text-5xl text-primary">{order ? formatBRL(order.valor_centavos) : "..."}</div>
            <p className="text-sm text-muted-foreground">{stickers.length}/{order?.quantity || 0} figurinha(s)</p>
            {hasRemaining && (
              <div className="mt-4 rounded-lg border border-copa-green/30 bg-copa-green/10 p-3 text-sm text-primary">
                Seu pacote ainda tem {remaining} figurinha{remaining > 1 ? "s" : ""} para gerar antes do pagamento.
                <Button onClick={() => navigate({ to: "/criar/$orderId", params: { orderId } })} className="mt-3 w-full bg-copa-green text-white">
                  Gerar figurinhas restantes
                </Button>
              </div>
            )}
            <ul className="mt-4 space-y-1 text-sm">
              <li className="flex items-center gap-1"><Check className="h-4 w-4 text-copa-green"/>Alta resolução 4K</li>
              <li className="flex items-center gap-1"><Check className="h-4 w-4 text-copa-green"/>Entrega imediata</li>
              <li className="flex items-center gap-1"><Check className="h-4 w-4 text-copa-green"/>Download ZIP de todas</li>
            </ul>
            {readyToPay ? (
              <Button asChild size="lg" className="mt-5 h-14 w-full bg-copa-red text-lg font-bold text-white">
                <Link to="/checkout/$id" params={{ id: orderId }}>⚽ Quero pagar agora</Link>
              </Button>
            ) : (
              <Button size="lg" disabled className="mt-5 h-14 w-full bg-copa-red text-lg font-bold text-white">
                Gere as figurinhas antes de pagar
              </Button>
            )}
          </Card>

          {/* Upsell */}
          {otherPlans.length > 0 && (
            <Card className="bg-secondary/30 p-6">
              <h3 className="font-display text-xl text-primary">Quer aproveitar?</h3>
              <p className="mb-3 text-xs text-muted-foreground">Adicione mais figurinhas com desconto antes de pagar.</p>
              <div className="space-y-2">
                {otherPlans.map((p) => {
                  const diff = p.price_centavos - (order?.valor_centavos || 0);
                  const perUnit = formatBRL(p.price_centavos / p.quantity);
                  return (
                    <button key={p.id} onClick={() => upgrade(p.slug)} className="flex w-full items-center justify-between rounded-lg border-2 bg-white p-3 text-left hover:border-copa-green">
                      <div>
                        <div className="font-bold text-primary">{p.name} — {p.quantity} figurinhas</div>
                        <div className="text-xs text-muted-foreground">{perUnit} cada</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{formatBRL(p.price_centavos)}</div>
                        <div className="text-xs text-copa-green">+{formatBRL(Math.max(0, diff))}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
