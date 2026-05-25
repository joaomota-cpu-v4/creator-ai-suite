import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap, Trophy, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <Trophy className="h-7 w-7 text-primary" />
          <span className="font-display text-2xl text-primary">FIGURINHA COPA</span>
        </div>
        <Link to="/login" className="text-sm font-medium text-primary/80 hover:text-primary">
          Admin
        </Link>
      </header>

      <main className="container mx-auto grid gap-12 px-6 py-10 md:grid-cols-2 md:items-center md:py-20">
        <div>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Edição Copa 2026
          </span>
          <h1 className="mt-4 font-display text-5xl leading-tight text-primary md:text-7xl">
            Transforme seu filho em uma <span className="text-copa-red">figurinha</span> da Copa do Mundo
          </h1>
          <p className="mt-5 max-w-lg text-lg text-primary/80">
            Em menos de 2 minutos, nossa IA gera uma figurinha personalizada estilo álbum oficial — com nome, clube e estatísticas do craque da casa.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="h-14 rounded-xl bg-primary text-lg font-bold text-primary-foreground hover:bg-primary/90">
              <Link to="/criar">⚽ Criar minha figurinha</Link>
            </Button>
            <div className="flex items-center gap-2 text-sm text-primary/80">
              <ShieldCheck className="h-4 w-4" /> Pagamento seguro · PIX ou cartão
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-6 text-sm text-primary/80">
            <div className="flex items-center gap-2"><Zap className="h-4 w-4" /> Pronta em 2 min</div>
            <div className="flex items-center gap-2"><Trophy className="h-4 w-4" /> Qualidade Panini</div>
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Gerada por IA</div>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="relative aspect-[3/4]">
            <FakeSticker rotate={-8} offset="left-0 top-6" name="LUCAS" club="BRA" num="10" tone="#0033A0" />
            <FakeSticker rotate={6} offset="right-0 top-0" name="PEDRO" club="ARG" num="7" tone="#00A859" />
            <FakeSticker rotate={-2} offset="left-1/2 -translate-x-1/2 top-16" name="JOÃO" club="ESP" num="9" tone="#c0392b" />
          </div>
        </div>
      </main>

      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container mx-auto grid gap-8 px-6 md:grid-cols-3">
          {[
            { t: "1. Envie a foto", d: "Foto recente do rosto do seu filho." },
            { t: "2. Personalize", d: "Nome, clube favorito, peso e altura." },
            { t: "3. Receba por e-mail", d: "Figurinha em alta qualidade pronta para imprimir." },
          ].map((s) => (
            <div key={s.t} className="rounded-2xl bg-white/5 p-6 backdrop-blur">
              <h3 className="font-display text-2xl">{s.t}</h3>
              <p className="mt-2 text-primary-foreground/80">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="bg-primary py-6 text-center text-xs text-primary-foreground/70">
        © {new Date().getFullYear()} Figurinha Copa · Produto não oficial. Apenas para diversão.
      </footer>
    </div>
  );
}

function FakeSticker({ rotate, offset, name, club, num, tone }: { rotate: number; offset: string; name: string; club: string; num: string; tone: string }) {
  return (
    <div
      className={`absolute ${offset} w-56 rounded-2xl border-4 border-white bg-white p-3 shadow-2xl`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <div className="flex aspect-[3/4] flex-col items-center justify-end overflow-hidden rounded-xl p-3 text-white" style={{ background: `linear-gradient(180deg, ${tone}, #111)` }}>
        <div className="text-6xl font-display">{num}</div>
        <div className="mt-1 text-xs font-bold uppercase tracking-widest">{club}</div>
        <div className="mt-1 text-lg font-display">{name}</div>
      </div>
    </div>
  );
}
