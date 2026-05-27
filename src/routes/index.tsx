import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap, Trophy, ShieldCheck, Star, Camera } from "lucide-react";
import stickerDaviLucca from "@/assets/sticker-davi-lucca.png";
import stickerEnzo from "@/assets/sticker-enzo.png";
import stickerMiguel from "@/assets/sticker-miguel.png";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          <span className="font-display text-xl text-primary">FIGURINHA COPA</span>
        </div>
        <span className="text-[10px] font-medium text-primary/40">Brasil 2026</span>
      </header>

      <main className="px-5 pb-10">
        <div className="mx-auto max-w-md">
          <div className="mb-3 flex items-center justify-center gap-2">
            <span className="rounded-full bg-copa-green px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              🇧🇷 Edição Brasil 2026
            </span>
          </div>

          <h1 className="text-center font-display text-4xl leading-[1.05] text-primary sm:text-5xl">
            Seu filho na <span className="text-copa-red">capa da Copa</span> em 2 minutos
          </h1>

          <p className="mx-auto mt-3 max-w-sm text-center text-base text-primary/80">
            Responda 4 perguntinhas, envie uma foto e nossa IA cria uma figurinha realista do seu pequeno craque.
          </p>

          <div className="relative mx-auto mt-6 h-80 w-full max-w-sm sm:h-96">
            <HeroStickerImage src={stickerMiguel} alt="Exemplo de figurinha infantil Miguel" rotate={-10} position="left-0 top-10" />
            <HeroStickerImage src={stickerEnzo} alt="Exemplo de figurinha infantil Enzo" rotate={8} position="right-0 top-4" />
            <HeroStickerImage src={stickerDaviLucca} alt="Exemplo de figurinha infantil Davi Lucca" rotate={-2} position="left-1/2 top-16 -translate-x-1/2" priority />
          </div>

          <Button asChild size="lg" className="mt-6 h-16 w-full rounded-2xl bg-copa-green text-lg font-bold text-white shadow-xl hover:bg-copa-green/90">
            <Link to="/criar">
              <Camera className="mr-2 h-5 w-5" /> Começar — é grátis tentar
            </Link>
          </Button>

          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-primary/70">
            <ShieldCheck className="h-3.5 w-3.5" /> Pague só se gostar · PIX ou cartão
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-primary/80">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-4 w-4 fill-copa-red text-copa-red" />
              ))}
            </div>
            <span>
              <b>+1.200 craques</b> já viraram figurinha
            </span>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-2">
            {[
              { n: "1", t: "Foto", i: <Camera className="h-4 w-4" /> },
              { n: "2", t: "IA cria", i: <Sparkles className="h-4 w-4" /> },
              { n: "3", t: "Receba", i: <Zap className="h-4 w-4" /> },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl bg-white p-3 text-center shadow-md">
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  {s.i}
                </div>
                <div className="mt-1 text-xs font-bold text-primary">
                  {s.n}. {s.t}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl bg-primary p-5 text-primary-foreground">
            <div className="font-display text-2xl">Apenas R$ 12,90</div>
            <p className="mt-1 text-sm text-primary-foreground/80">
              Figurinha em alta resolução, pronta pra imprimir, postar e mandar pra família toda.
            </p>
          </div>
        </div>
      </main>

      <footer className="bg-primary px-5 py-5 text-center text-[11px] text-primary-foreground/70">
        © {new Date().getFullYear()} Figurinha Copa · Produto não oficial. Apenas para diversão.
      </footer>
    </div>
  );
}

function HeroStickerImage({
  src,
  alt,
  rotate,
  position,
}: {
  src: string;
  alt: string;
  rotate: number;
  position: string;
  priority?: boolean;
}) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`absolute w-36 rounded-[28px] border-4 border-white bg-white object-cover shadow-2xl sm:w-44 ${position}`}
      style={{ transform: `translateZ(0) rotate(${rotate}deg)` }}
    />
  );
}
