import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { createAsaasPayment } from "@/lib/asaas.functions";
import { getOrderFull } from "@/lib/order.functions";
import { formatBRL } from "@/lib/price";
import { fbqTrack, getMetaAttribution } from "@/lib/pixel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout/$id")({ component: Checkout });

function Checkout() {
  const printablePackPrice = 990;
  const { id } = useParams({ from: "/checkout/$id" });
  const navigate = useNavigate();
  const pay = useServerFn(createAsaasPayment);
  const fetchOrder = useServerFn(getOrderFull);
  const orderQ = useQuery({ queryKey: ["order-full", id], queryFn: () => fetchOrder({ data: { id } }) });
  const order = orderQ.data?.order;
  const plan = orderQ.data?.plan;
  const stickers = orderQ.data?.stickers || [];
  const orderValue = order?.valor_centavos && order.valor_centavos > 0 ? order.valor_centavos : (plan?.price_centavos ?? 0);
  const baseValor = order ? Math.max(0, orderValue - (order.printable_pack ? printablePackPrice : 0)) : 0;
  const [printablePack, setPrintablePack] = useState(false);
  const valor = order ? baseValor + (printablePack ? printablePackPrice : 0) : 0;
  const formatted = formatBRL(valor);
  const readyToPay = Boolean(order)
    && stickers.length >= (order?.quantity || 1)
    && stickers.length > 0
    && stickers.every((sticker) => Boolean(sticker.foto_original_path || sticker.preview_url || sticker.figurinha_url));

  const [loading, setLoading] = useState(false);
  const [metodo, setMetodo] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [f, setF] = useState({
    nome: "", cpf: "", email: "", telefone: "",
    holderName: "", number: "", expiryMonth: "", expiryYear: "", ccv: "",
  });
  const u = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (order?.printable_pack) setPrintablePack(true);
  }, [order?.printable_pack]);

  useEffect(() => {
    const firstSticker = orderQ.data?.stickers?.[0];
    if (!order && !firstSticker) return;
    setF((prev) => ({
      ...prev,
      nome: prev.nome || order?.nome || firstSticker?.nome || "",
      email: prev.email || order?.email || firstSticker?.email || "",
      holderName: prev.holderName || order?.nome || firstSticker?.nome || "",
    }));
  }, [orderQ.data]);

  useEffect(() => {
    if (!orderQ.data?.order.id || !valor) return;
    const order = orderQ.data.order;
    const firstSticker = orderQ.data.stickers?.[0];
    fbqTrack("InitiateCheckout", {
      content_name: orderQ.data.plan?.name || "Figurinha Copa",
      value: valor / 100,
      currency: "BRL",
    }, {
      email: f.email || order.email || firstSticker?.email,
      phone: f.telefone || order.telefone,
      name: f.nome || order.nome || firstSticker?.nome,
      externalId: order.id,
    });
  }, [orderQ.data?.order.id, orderQ.data?.plan?.name, valor]);

  const submit = async () => {
    if (!readyToPay) {
      if (orderQ.isLoading) return toast.error("Aguarde carregar o pedido.");
      if (orderQ.isError || !order) return toast.error("Pedido não carregou. Atualize a página e tente novamente.");
      return toast.error("Envie todas as fotos do plano antes de pagar.");
    }
    if (!f.nome || !f.cpf || !f.email || !f.telefone) return toast.error("Preencha seus dados");
    if (metodo === "CREDIT_CARD") {
      const cardOk =
        f.holderName.trim().length >= 2
        && f.number.replace(/\D/g, "").length >= 13
        && f.expiryMonth.replace(/\D/g, "").length >= 1
        && f.expiryYear.replace(/\D/g, "").length >= 2
        && f.ccv.replace(/\D/g, "").length >= 3;
      if (!cardOk) return toast.error("Preencha todos os dados do cartao");
    }
    setLoading(true);
    try {
      fbqTrack("AddPaymentInfo", {
        content_name: orderQ.data?.plan?.name || "Figurinha Copa",
        value: valor / 100,
        currency: "BRL",
      }, {
        email: f.email,
        phone: f.telefone,
        name: f.nome,
        externalId: orderQ.data?.order.id || id,
      });
      await pay({
        data: {
          order_id: orderQ.data?.order.id || id,
          nome: f.nome, cpf: f.cpf, email: f.email, telefone: f.telefone,
          metodo,
          printable_pack: printablePack,
          meta: getMetaAttribution(),
          card: metodo === "CREDIT_CARD" ? {
            holderName: f.holderName, number: f.number,
            expiryMonth: f.expiryMonth, expiryYear: f.expiryYear, ccv: f.ccv,
          } : undefined,
        },
      });
      navigate({ to: "/sucesso/$id", params: { id: orderQ.data?.order.id || id } });
    } catch (e: any) {
      toast.error(e.message || "Erro no pagamento");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <div className="container mx-auto max-w-md px-4 py-6">
        <h1 className="font-display text-3xl text-primary">Finalizar pedido</h1>
        <p className="mt-1 text-sm text-primary/80">
          {orderQ.isLoading ? (
            <>Carregando pedido...</>
          ) : orderQ.isError || !order ? (
            <>Pedido não carregou. Atualize a página.</>
          ) : (
            <>Plano <b>{plan?.name || "..."}</b> · {order.quantity || plan?.quantity || 0} figurinha(s) · Total: <b>{formatted}</b></>
          )}
        </p>

        <div className="mt-6 space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
          {!orderQ.isLoading && !orderQ.isError && order && !readyToPay && (
            <div className="rounded-2xl border border-copa-red/30 bg-copa-red/10 p-4 text-sm text-copa-red">
              Envie todas as fotos do plano antes de ir para o pagamento.
            </div>
          )}
          {!orderQ.isLoading && (orderQ.isError || !order) && (
            <div className="rounded-2xl border border-copa-red/30 bg-copa-red/10 p-4 text-sm text-copa-red">
              Não foi possível carregar este pedido. Atualize a página e tente novamente.
            </div>
          )}

          <h2 className="font-semibold">Seus dados</h2>
          <div className="grid gap-3">
            <div><Label>Nome completo</Label><Input value={f.nome} onChange={(e) => u("nome", e.target.value)}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CPF</Label><Input value={f.cpf} onChange={(e) => u("cpf", e.target.value)} placeholder="000.000.000-00"/></div>
              <div><Label>Telefone</Label><Input value={f.telefone} onChange={(e) => u("telefone", e.target.value)} placeholder="(11) 99999-9999"/></div>
            </div>
            <div><Label>E-mail</Label><Input type="email" value={f.email} onChange={(e) => u("email", e.target.value)}/></div>
          </div>

          <h2 className="pt-2 font-semibold">Oferta especial</h2>
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (order) setPrintablePack((v) => !v);
            }}
            onKeyDown={(event) => {
              if (order && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                setPrintablePack((v) => !v);
              }
            }}
            className="flex w-full items-start gap-3 rounded-2xl border-2 border-dashed border-copa-green/50 bg-copa-green/10 p-4 text-left transition hover:bg-copa-green/15"
          >
            <Checkbox
              checked={printablePack}
              disabled={!order}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={(checked) => {
                if (order) setPrintablePack(checked === true);
              }}
              className="mt-1"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-primary">Adicionar pacote de figurinhas da Copa para imprimir</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Arquivo digital extra para imprimir em casa ou gráfica. Entrega junto com a figurinha personalizada.
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-copa-green px-2 py-1 text-xs font-bold text-white">
              + R$ 9,90
            </span>
          </div>

          <h2 className="pt-2 font-semibold">Forma de pagamento</h2>
          <Tabs value={metodo} onValueChange={(v) => setMetodo(v as any)}>
            <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="PIX">PIX</TabsTrigger><TabsTrigger value="CREDIT_CARD">Cartão</TabsTrigger></TabsList>
            <TabsContent value="PIX" className="text-sm text-muted-foreground">QR Code na próxima tela. Liberação automática.</TabsContent>
            <TabsContent value="CREDIT_CARD" className="grid gap-3">
              <div><Label>Nome no cartão</Label><Input value={f.holderName} onChange={(e) => u("holderName", e.target.value)}/></div>
              <div><Label>Número</Label><Input value={f.number} onChange={(e) => u("number", e.target.value)} placeholder="0000 0000 0000 0000"/></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Mês</Label><Input value={f.expiryMonth} onChange={(e) => u("expiryMonth", e.target.value)} placeholder="12"/></div>
                <div><Label>Ano</Label><Input value={f.expiryYear} onChange={(e) => u("expiryYear", e.target.value)} placeholder="2028"/></div>
                <div><Label>CCV</Label><Input value={f.ccv} onChange={(e) => u("ccv", e.target.value)} placeholder="123"/></div>
              </div>
            </TabsContent>
          </Tabs>

          <Button size="lg" onClick={submit} disabled={loading || !valor || !readyToPay} className="h-14 w-full bg-copa-green text-lg font-bold text-white">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Processando...</> : `Pagar ${formatted}`}
          </Button>
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5"/>Pagamento processado pela Asaas
          </p>
        </div>
      </div>
    </div>
  );
}
