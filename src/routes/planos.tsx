import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listActivePlans } from "@/lib/plans.functions";
import { formatBRL } from "@/lib/price";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Trophy } from "lucide-react";

export const Route = createFileRoute("/planos")({ component: Planos });

function Planos() {
  const navigate = useNavigate();
  const fetchPlans = useServerFn(listActivePlans);
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => fetchPlans() });
  const planList = plans.data || [];

  const choose = (slug: string) => {
    navigate({ to: "/criar/plano/$planSlug", params: { planSlug: slug } });
  };

  const cheapest = plans.data?.[0];
  const pricePerUnit = (p: any) => p.price_centavos / p.quantity;
  const economy = (p: any) =>
    cheapest && p.quantity > 1
      ? Math.round(((cheapest.price_centavos * p.quantity - p.price_centavos) / (cheapest.price_centavos * p.quantity)) * 100)
      : 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <header className="flex items-center gap-2 px-5 py-4">
        <Trophy className="h-6 w-6 text-primary" />
        <span className="font-display text-xl text-primary">FIGURINHA COPA</span>
      </header>
      <main className="container mx-auto max-w-5xl px-4 pb-12">
        <h1 className="text-center font-display text-4xl text-primary md:text-5xl">Escolha seu pacote</h1>
        <p className="mt-2 text-center text-primary/80">Quanto mais figurinhas, mais barato fica cada uma 🎯</p>

        {plans.isLoading && (
          <Card className="mx-auto mt-8 max-w-md p-6 text-center">
            <p className="font-semibold text-primary">Carregando planos...</p>
          </Card>
        )}

        {plans.isError && (
          <Card className="mx-auto mt-8 max-w-md p-6 text-center">
            <p className="font-semibold text-primary">Nao foi possivel carregar os planos.</p>
            <p className="mt-2 text-sm text-muted-foreground">Verifique a conexao com Supabase e tente novamente.</p>
          </Card>
        )}

        {!plans.isLoading && !plans.isError && planList.length === 0 && (
          <Card className="mx-auto mt-8 max-w-md p-6 text-center">
            <p className="font-semibold text-primary">Nenhum plano ativo encontrado.</p>
            <p className="mt-2 text-sm text-muted-foreground">Ative ou crie planos no painel admin.</p>
          </Card>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {planList.map((p, i) => {
            const ec = economy(p);
            const featured = i === planList.length - 1;
            return (
              <Card key={p.id} className={`relative flex flex-col p-5 ${featured ? "ring-4 ring-copa-red shadow-2xl scale-105" : ""}`}>
                {featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-copa-red px-3 py-1 text-xs font-bold text-white">
                    MELHOR OFERTA
                  </span>
                )}
                <h3 className="font-display text-2xl text-primary">{p.name}</h3>
                <div className="mt-2 font-display text-4xl text-primary">{p.quantity}<span className="ml-1 text-base text-muted-foreground">figurinha{p.quantity > 1 ? "s" : ""}</span></div>
                <div className="mt-3 text-3xl font-bold text-copa-green">{formatBRL(p.price_centavos)}</div>
                <div className="text-xs text-muted-foreground">{formatBRL(pricePerUnit(p))} cada</div>
                {ec > 0 && (
                  <div className="mt-1 inline-block rounded-full bg-copa-green/10 px-2 py-0.5 text-xs font-semibold text-copa-green">economize {ec}%</div>
                )}
                <ul className="mt-4 flex-1 space-y-1 text-sm">
                  <li className="flex items-center gap-1"><Check className="h-4 w-4 text-copa-green" /> Alta resolução 4K</li>
                  <li className="flex items-center gap-1"><Check className="h-4 w-4 text-copa-green" /> Pronta para imprimir</li>
                  <li className="flex items-center gap-1"><Check className="h-4 w-4 text-copa-green" /> Entrega por e-mail</li>
                </ul>
                <Button onClick={() => choose(p.slug)} className="mt-4 bg-primary">
                  Escolher
                </Button>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
