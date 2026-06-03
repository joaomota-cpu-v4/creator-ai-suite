import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { listActivePlans } from "@/lib/plans.functions";
import { createDraftOrder, getOrderFull } from "@/lib/order.functions";
import { createStickerDraft } from "@/lib/sticker.functions";
import { formatBRL } from "@/lib/price";
import { fbqTrack } from "@/lib/pixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, ShieldCheck, Sparkles, Star, Upload, Zap } from "lucide-react";
import { toast } from "sonner";
import stickerDaviLucca from "@/assets/sticker-davi-lucca.png";
import stickerEnzo from "@/assets/sticker-enzo.png";
import stickerMiguel from "@/assets/sticker-miguel.png";

export const Route = createFileRoute("/pre-pago")({ component: PrePago });

function PrePago() {
  const navigate = useNavigate();
  const fetchPlans = useServerFn(listActivePlans);
  const newOrder = useServerFn(createDraftOrder);
  const fetchOrder = useServerFn(getOrderFull);
  const saveDraft = useServerFn(createStickerDraft);

  const plans = useQuery({ queryKey: ["plans"], queryFn: () => fetchPlans() });
  const [started, setStarted] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: "", data_nascimento: "", clube: "", peso_kg: "", altura_cm: "", email: "", foto_base64: "",
  });

  const orderQ = useQuery({
    queryKey: ["prepaid-order", orderId],
    queryFn: () => fetchOrder({ data: { id: orderId! } }),
    enabled: !!orderId,
  });

  const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const selectedPlan = (plans.data || []).find((plan) => plan.slug === selectedPlanSlug) || plans.data?.[0];
  const used = orderQ.data?.stickers.length ?? 0;
  const quantity = orderQ.data?.order.quantity ?? selectedPlan?.quantity ?? 1;

  useEffect(() => {
    fbqTrack("ViewContent", { content_name: "Pre pago figurinha", content_category: "prepaid_flow" });
  }, []);

  const onPhoto = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) return toast.error("Maximo 15MB");
    try { update("foto_base64", await compressImage(file, 768, 0.75)); }
    catch {
      const reader = new FileReader();
      reader.onload = () => update("foto_base64", reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const submitDraft = async () => {
    if (!form.nome || !form.email || !form.foto_base64) {
      toast.error("Informe nome, e-mail e foto");
      return;
    }
    if (!orderId && !selectedPlanSlug && !selectedPlan?.slug) {
      toast.error("Escolha um plano");
      return;
    }

    setSaving(true);
    try {
      let currentOrderId = orderId;
      if (!currentOrderId) {
        const result = await newOrder({ data: { planSlug: selectedPlanSlug || selectedPlan!.slug } });
        currentOrderId = result.orderId;
        setOrderId(result.orderId);
      }

      await saveDraft({
        data: {
          order_id: currentOrderId,
          nome: form.nome,
          email: form.email,
          data_nascimento: form.data_nascimento || null,
          clube: form.clube || null,
          peso_kg: form.peso_kg ? Number(form.peso_kg) : null,
          altura_cm: form.altura_cm ? Number(form.altura_cm) : null,
          foto_base64: form.foto_base64,
        },
      });
      fbqTrack("Lead", {
        content_name: "Previa figurinha",
        content_category: "prepaid_preview",
        value: selectedPlan ? selectedPlan.price_centavos / 100 : undefined,
        currency: "BRL",
      });
      await orderQ.refetch();
      if (used + 1 >= quantity) {
        fbqTrack("InitiateCheckout", {
          content_name: selectedPlan?.name || "Figurinha Copa",
          value: selectedPlan ? selectedPlan.price_centavos / 100 : undefined,
          currency: "BRL",
        });
        navigate({ to: "/checkout/$id", params: { id: currentOrderId } });
      } else {
        setForm({ nome: "", data_nascimento: "", clube: "", peso_kg: "", altura_cm: "", email: form.email, foto_base64: "" });
        toast.success("Previa salva. Envie a proxima foto.");
      }
    } catch (e: any) {
      toast.error(e.message || "Nao foi possivel salvar a previa");
    } finally {
      setSaving(false);
    }
  };

  if (!started) {
    return (
      <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: "var(--copa-yellow)" }}>
        <main className="px-5 py-8">
          <div className="mx-auto max-w-md">
            <div className="mb-3 flex items-center justify-center gap-2">
              <span className="rounded-full bg-copa-green px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                PREVIEW GRATIS ANTES DO PIX
              </span>
            </div>

            <h1 className="mx-auto max-w-sm text-center font-display text-3xl leading-[1.08] text-primary sm:text-5xl">
              Veja a previa antes de pagar
            </h1>

            <p className="mx-auto mt-3 max-w-xs text-center text-sm leading-relaxed text-primary/80 sm:max-w-sm sm:text-base">
              Envie a foto, preencha os dados e veja um modelo com blur. A IA final so roda depois da confirmacao do pagamento.
            </p>

            <div className="relative mx-auto mt-6 h-80 w-full max-w-sm sm:h-96">
              <HeroStickerImage src={stickerMiguel} alt="Exemplo de figurinha infantil Miguel" rotate={-10} position="left-0 top-10" />
              <HeroStickerImage src={stickerEnzo} alt="Exemplo de figurinha infantil Enzo" rotate={8} position="right-0 top-4" />
              <HeroStickerImage src={stickerDaviLucca} alt="Exemplo de figurinha infantil Davi Lucca" rotate={-2} position="left-1/2 top-16 -translate-x-1/2" />
            </div>

            <Button onClick={() => {
              fbqTrack("Lead", { content_name: "Comecar pre pago", content_category: "prepaid_start" });
              setStarted(true);
            }} size="lg" className="mt-6 h-16 w-full rounded-2xl bg-copa-green text-lg font-bold text-white shadow-xl hover:bg-copa-green/90">
              <Camera className="mr-2 h-5 w-5" /> Comecar - e gratis tentar
            </Button>

            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-primary/70">
              <ShieldCheck className="h-3.5 w-3.5" /> Sem custo de IA antes do pagamento
            </div>

            <div className="mt-8 grid grid-cols-3 gap-2">
              {[
                { n: "1", t: "Foto", i: <Camera className="h-4 w-4" /> },
                { n: "2", t: "Preview", i: <Sparkles className="h-4 w-4" /> },
                { n: "3", t: "PIX", i: <Zap className="h-4 w-4" /> },
              ].map((s) => (
                <div key={s.n} className="min-w-0 rounded-2xl bg-white p-3 text-center shadow-md">
                  <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    {s.i}
                  </div>
                  <div className="mt-1 text-xs font-bold text-primary">
                    {s.n}. {s.t}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-primary/80">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-copa-red text-copa-red" />
                ))}
              </div>
              <span>
                A figurinha final e gerada apos o PIX
              </span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <main className="container mx-auto grid max-w-6xl gap-6 md:grid-cols-[1fr_420px]">
        <section className="rounded-3xl bg-white p-5 shadow-2xl md:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl text-primary">Criar previa</h1>
              <p className="text-sm text-muted-foreground">{used}/{quantity} previa(s) salva(s)</p>
            </div>
            {used > 0 && (
              <Button variant="outline" onClick={() => {
                fbqTrack("InitiateCheckout", {
                  content_name: selectedPlan?.name || "Figurinha Copa",
                  value: selectedPlan ? selectedPlan.price_centavos / 100 : undefined,
                  currency: "BRL",
                });
                navigate({ to: "/checkout/$id", params: { id: orderId } });
              }}>
                Pagar agora
              </Button>
            )}
          </div>

          <div className="grid gap-4">
            <div><Label>Nome do jogador</Label><Input value={form.nome} onChange={(e) => update("nome", e.target.value)} placeholder="Murilo Ferreira" /></div>
            <div className="grid gap-3 md:grid-cols-3">
              <div><Label>Nascimento</Label><Input type="date" value={form.data_nascimento} onChange={(e) => update("data_nascimento", e.target.value)} /></div>
              <div><Label>Altura (cm)</Label><Input type="number" value={form.altura_cm} onChange={(e) => update("altura_cm", e.target.value)} placeholder="110" /></div>
              <div><Label>Peso (kg)</Label><Input type="number" value={form.peso_kg} onChange={(e) => update("peso_kg", e.target.value)} placeholder="50" /></div>
            </div>
            <div><Label>Clube</Label><Input value={form.clube} onChange={(e) => update("clube", e.target.value)} placeholder="Real Madrid CF (ESP)" /></div>
            <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="voce@email.com" /></div>
            <label className="flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-primary/30 bg-secondary/30 p-6 text-center">
              <div>
                <Upload className="mx-auto h-8 w-8 text-primary" />
                <p className="mt-2 font-medium text-primary">{form.foto_base64 ? "Trocar foto" : "Enviar foto"}</p>
                <p className="text-xs text-muted-foreground">Rosto bem visivel, ate 15MB</p>
              </div>
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
            </label>

            {!orderId && (
              <div>
                <Label>Escolha o plano</Label>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  {(plans.data || []).map((plan) => {
                    const active = (selectedPlanSlug || selectedPlan?.slug) === plan.slug;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanSlug(plan.slug)}
                        className={`rounded-2xl border p-4 text-left transition ${active ? "border-copa-green bg-copa-green/10" : "border-primary/15 bg-white hover:border-primary/40"}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-display text-xl text-primary">{plan.name}</span>
                          <span className="font-bold text-copa-green">{formatBRL(plan.price_centavos)}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{plan.quantity} figurinha{plan.quantity > 1 ? "s" : ""}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <Button onClick={submitDraft} disabled={saving} className="mt-6 h-12 w-full bg-copa-green text-white">
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : used + 1 >= quantity ? "Salvar previa e ir para pagamento" : "Salvar previa"}
          </Button>
        </section>

        <PreviewCard form={form} />
      </main>
    </div>
  );
}

function PreviewCard({ form }: { form: { nome: string; data_nascimento: string; clube: string; peso_kg: string; altura_cm: string; foto_base64: string } }) {
  const name = (form.nome || "MURILO FERREIRA").toUpperCase();
  const birth = form.data_nascimento ? form.data_nascimento.split("-").reverse().join("/") : "12/07/2016";
  const height = form.altura_cm ? `${(Number(form.altura_cm) / 100).toFixed(2).replace(".", ",")}m` : "1,10m";
  const weight = form.peso_kg ? `${form.peso_kg}kg` : "50kg";
  const club = (form.clube || "REAL MADRID CF (ESP)").toUpperCase();

  return (
    <aside className="mx-auto w-full max-w-[420px]" aria-label="Preview da figurinha">
      <div className="relative aspect-[608/820] overflow-hidden rounded-[24px] bg-[#58C7CF]">
        <img
          src="/assets/sticker-preview-bg.svg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 z-[1] h-full w-full object-cover"
        />

        {form.foto_base64 ? (
          <img
            src={form.foto_base64}
            alt="Previa bloqueada do jogador"
            className="absolute left-1/2 top-[8%] z-[2] h-[76%] w-[88%] -translate-x-1/2 scale-[1.08] object-cover object-top opacity-80 blur-[7px] saturate-95"
            style={{
              WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 9%, black 91%, transparent 100%), linear-gradient(180deg, black 0%, black 88%, transparent 100%)",
              WebkitMaskComposite: "source-in",
              maskImage: "linear-gradient(90deg, transparent 0%, black 9%, black 91%, transparent 100%), linear-gradient(180deg, black 0%, black 88%, transparent 100%)",
              maskComposite: "intersect",
            }}
          />
        ) : (
          <div className="absolute left-1/2 top-[17%] z-[3] flex h-[48%] w-[76%] -translate-x-1/2 items-center justify-center text-center text-sm font-semibold text-primary/70">
            Envie uma foto
          </div>
        )}

        {form.foto_base64 && (
          <div className="absolute left-1/2 top-[46%] z-[6] -translate-x-1/2 -rotate-[10deg] rounded-full border border-white/50 bg-white/25 px-10 py-3 text-center text-[20px] font-black uppercase tracking-[.14em] text-white shadow-lg backdrop-blur-[8px]">
            PREVIA
          </div>
        )}

        <div className="absolute bottom-[64px] left-1/2 z-[5] h-[75px] w-[90%] -translate-x-1/2 rounded-[22px] bg-[#1C8C93] px-6 py-3 text-white shadow-xl">
          <div className="truncate text-[30px] font-black uppercase leading-none md:text-[36px]">{name}</div>
          <div className="mt-2 text-[16px] font-medium text-[#EAF7F8]">{birth.replace(/\//g, "-")} | {height} | {weight}</div>
        </div>
        <div className="absolute bottom-[18px] left-1/2 z-[5] flex h-[40px] w-[65%] -translate-x-1/2 items-center justify-center rounded-[12px] bg-[#147A82] px-3 text-center text-[14px] font-bold tracking-[.5px] text-white">
          <span className="truncate">{club}</span>
        </div>
      </div>
    </aside>
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

const compressImage = (file: File, maxSide: number, quality: number) =>
  new Promise<string>((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img")); };
    img.src = url;
  });
