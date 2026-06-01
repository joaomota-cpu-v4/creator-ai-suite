import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createAsaasPayment } from "@/lib/asaas.functions";
import { usePrice } from "@/lib/price";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout/$id")({ component: Checkout });

function Checkout() {
  const { id } = useParams({ from: "/checkout/$id" });
  const navigate = useNavigate();
  const pay = useServerFn(createAsaasPayment);
  const price = usePrice();
  const [loading, setLoading] = useState(false);
  const [metodo, setMetodo] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [f, setF] = useState({
    nome: "",
    cpf: "",
    email: "",
    telefone: "",
    holderName: "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    ccv: "",
  });
  const u = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.nome || !f.cpf || !f.email || !f.telefone) return toast.error("Preencha seus dados");
    setLoading(true);
    try {
      await pay({
        data: {
          sticker_id: id,
          nome: f.nome,
          cpf: f.cpf,
          email: f.email,
          telefone: f.telefone,
          metodo,
          card: metodo === "CREDIT_CARD" ? {
            holderName: f.holderName,
            number: f.number,
            expiryMonth: f.expiryMonth,
            expiryYear: f.expiryYear,
            ccv: f.ccv,
          } : undefined,
        },
      });
      navigate({ to: "/sucesso/$id", params: { id } });
    } catch (e: any) {
      toast.error(e.message || "Erro no pagamento");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <div className="container mx-auto max-w-md px-4 py-6">
        <h1 className="font-display text-3xl text-primary">Finalizar pedido</h1>
        <p className="mt-1 text-sm text-primary/80">Total: <b>{price.formatted}</b></p>

        <div className="mt-6 space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
          <h2 className="font-semibold">Seus dados</h2>
          <div className="grid gap-3">
            <div><Label>Nome completo</Label><Input value={f.nome} onChange={(e) => u("nome", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CPF</Label><Input value={f.cpf} onChange={(e) => u("cpf", e.target.value)} placeholder="000.000.000-00" /></div>
              <div><Label>Telefone</Label><Input value={f.telefone} onChange={(e) => u("telefone", e.target.value)} placeholder="(11) 99999-9999" /></div>
            </div>
            <div><Label>E-mail</Label><Input type="email" value={f.email} onChange={(e) => u("email", e.target.value)} /></div>
          </div>

          <h2 className="pt-2 font-semibold">Forma de pagamento</h2>
          <Tabs value={metodo} onValueChange={(v) => setMetodo(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="PIX">PIX</TabsTrigger>
              <TabsTrigger value="CREDIT_CARD">Cartão</TabsTrigger>
            </TabsList>
            <TabsContent value="PIX" className="text-sm text-muted-foreground">
              Você verá o QR Code na próxima tela. A liberação é automática após o pagamento.
            </TabsContent>
            <TabsContent value="CREDIT_CARD" className="grid gap-3">
              <div><Label>Nome no cartão</Label><Input value={f.holderName} onChange={(e) => u("holderName", e.target.value)} /></div>
              <div><Label>Número</Label><Input value={f.number} onChange={(e) => u("number", e.target.value)} placeholder="0000 0000 0000 0000" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Mês</Label><Input value={f.expiryMonth} onChange={(e) => u("expiryMonth", e.target.value)} placeholder="12" /></div>
                <div><Label>Ano</Label><Input value={f.expiryYear} onChange={(e) => u("expiryYear", e.target.value)} placeholder="2028" /></div>
                <div><Label>CCV</Label><Input value={f.ccv} onChange={(e) => u("ccv", e.target.value)} placeholder="123" /></div>
              </div>
            </TabsContent>
          </Tabs>

          <Button size="lg" onClick={submit} disabled={loading} className="h-14 w-full bg-copa-green text-lg font-bold text-white hover:bg-copa-green/90">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processando...</> : `Pagar ${price.formatted}`}
          </Button>

          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Pagamento processado pela Asaas
          </p>
        </div>
      </div>
    </div>
  );
}
