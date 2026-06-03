import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { createDraftOrder } from "@/lib/order.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/criar/plano/$planSlug")({ component: CriarComPlano });

function CriarComPlano() {
  const { planSlug } = useParams({ from: "/criar/plano/$planSlug" });
  const navigate = useNavigate();
  const createOrder = useServerFn(createDraftOrder);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      const { orderId } = await createOrder({ data: { planSlug } });
      navigate({ to: "/criar/$orderId", params: { orderId }, replace: true });
    } catch (e: any) {
      setError(e?.message || "Nao foi possivel iniciar o pedido.");
      setLoading(false);
    }
  };

  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSlug]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <Card className="w-full max-w-md p-6 text-center">
        {loading ? (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <h1 className="mt-4 font-display text-2xl text-primary">Preparando seu pedido</h1>
            <p className="mt-2 text-sm text-muted-foreground">Isso deve levar poucos segundos.</p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl text-primary">Nao foi possivel abrir o formulario</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button onClick={start} className="mt-5 w-full bg-primary">Tentar novamente</Button>
            <Button variant="ghost" onClick={() => navigate({ to: "/planos" })} className="mt-2 w-full">Voltar aos planos</Button>
          </>
        )}
      </Card>
    </div>
  );
}
