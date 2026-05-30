import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getStickerPublic } from "@/lib/sticker.functions";
import { fbqTrack } from "@/lib/pixel";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";

export const Route = createFileRoute("/oferta/$id")({ component: Oferta });

function Oferta() {
  const { id } = useParams({ from: "/oferta/$id" });
  const fetchSticker = useServerFn(getStickerPublic);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["sticker", id],
    queryFn: () => fetchSticker({ data: { id } }),
    refetchInterval: (q) => (q.state.data?.status === "generated" ? false : 3000),
  });

  useEffect(() => {
    fbqTrack("InitiateCheckout", { content_name: "Figurinha Copa", value: 12.9, currency: "BRL" });
  }, []);


  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <div className="container mx-auto max-w-md px-4 py-6 md:max-w-3xl md:py-10">
        <h1 className="text-center font-display text-3xl text-primary md:text-5xl">
          Sua figurinha está pronta! 🏆
        </h1>
        <p className="mt-2 text-center text-sm text-primary/80">Confira o preview e desbloqueie a versão em alta qualidade.</p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-4 shadow-2xl">
            <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-secondary/30">
              {data?.preview_url ? (
                <>
                  <img src={data.preview_url} alt="figurinha" className="h-full w-full object-cover object-center" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/50 to-black/85" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm ring-2 ring-white/40">
                      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></svg>
                    </div>
                    <div className="font-display text-xl leading-tight">Libere sua figurinha<br/>após o pagamento</div>
                    <span className="rounded-full bg-copa-green px-3 py-1 text-xs font-bold uppercase tracking-wide">Pronta em alta resolução</span>
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-center">
                  <div>
                    <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
                    <p className="mt-2 text-sm text-muted-foreground">Gerando sua figurinha...</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-muted-foreground line-through">R$ 29,90</span>
                <span className="rounded-full bg-copa-red px-2 py-0.5 text-xs font-bold text-white">-57%</span>
              </div>
              <div className="font-display text-5xl text-primary">R$ 12,90</div>
              <p className="text-sm text-muted-foreground">à vista no PIX ou cartão</p>

              <ul className="mt-4 space-y-2 text-sm">
                {[
                  "Figurinha em alta resolução (4K)",
                  "Pronta para imprimir em qualquer tamanho",
                  "Entrega imediata por e-mail",
                  "Garantia de satisfação",
                ].map((b) => (
                  <li key={b} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-copa-green" /> {b}
                  </li>
                ))}
              </ul>

              <Button asChild size="lg" disabled={!data || data.status !== "generated"} className="mt-5 h-14 w-full bg-copa-red text-lg font-bold text-white hover:bg-copa-red/90">
                <Link to="/checkout/$id" params={{ id }}>
                  {data?.status === "generated" ? "⚽ Quero minha figurinha" : "Aguardando geração..."}
                </Link>
              </Button>
            </div>

            <button onClick={() => refetch()} className="w-full text-center text-xs text-primary/70 underline">
              Atualizar status
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
