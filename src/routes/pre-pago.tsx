import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listActivePlans } from "@/lib/plans.functions";
import { createDraftOrder, getOrderFull } from "@/lib/order.functions";
import { createStickerDraft } from "@/lib/sticker.functions";
import { formatBRL } from "@/lib/price";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pre-pago")({ component: PrePago });

function PrePago() {
  const navigate = useNavigate();
  const fetchPlans = useServerFn(listActivePlans);
  const newOrder = useServerFn(createDraftOrder);
  const fetchOrder = useServerFn(getOrderFull);
  const saveDraft = useServerFn(createStickerDraft);

  const plans = useQuery({ queryKey: ["plans"], queryFn: () => fetchPlans() });
  const [orderId, setOrderId] = useState<string | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
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
  const used = orderQ.data?.stickers.length ?? 0;
  const quantity = orderQ.data?.order.quantity ?? 1;

  const choosePlan = async (planSlug: string) => {
    setCreatingOrder(true);
    try {
      const result = await newOrder({ data: { planSlug } });
      setOrderId(result.orderId);
    } catch (e: any) {
      toast.error(e.message || "Nao foi possivel iniciar o pedido");
    } finally {
      setCreatingOrder(false);
    }
  };

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
    if (!orderId) return;
    if (!form.nome || !form.email || !form.foto_base64) {
      toast.error("Informe nome, e-mail e foto");
      return;
    }

    setSaving(true);
    try {
      await saveDraft({
        data: {
          order_id: orderId,
          nome: form.nome,
          email: form.email,
          data_nascimento: form.data_nascimento || null,
          clube: form.clube || null,
          peso_kg: form.peso_kg ? Number(form.peso_kg) : null,
          altura_cm: form.altura_cm ? Number(form.altura_cm) : null,
          foto_base64: form.foto_base64,
        },
      });
      await orderQ.refetch();
      if (used + 1 >= quantity) {
        navigate({ to: "/checkout/$id", params: { id: orderId } });
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

  if (!orderId) {
    return (
      <div className="min-h-screen px-4 py-8" style={{ backgroundColor: "var(--copa-yellow)" }}>
        <main className="container mx-auto max-w-5xl">
          <h1 className="text-center font-display text-4xl text-primary md:text-5xl">Fluxo pre-pago</h1>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-primary/80">
            Teste: o cliente ve uma previa, paga o PIX, e a IA gera a figurinha final depois da confirmacao.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {(plans.data || []).map((plan) => (
              <Card key={plan.id} className="flex flex-col p-5">
                <h2 className="font-display text-2xl text-primary">{plan.name}</h2>
                <div className="mt-2 text-4xl font-bold text-primary">{plan.quantity}</div>
                <p className="text-sm text-muted-foreground">figurinha{plan.quantity > 1 ? "s" : ""}</p>
                <div className="mt-3 text-2xl font-bold text-copa-green">{formatBRL(plan.price_centavos)}</div>
                <Button onClick={() => choosePlan(plan.slug)} disabled={creatingOrder} className="mt-5 bg-primary">
                  {creatingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : "Testar este plano"}
                </Button>
              </Card>
            ))}
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
              <Button variant="outline" onClick={() => navigate({ to: "/checkout/$id", params: { id: orderId } })}>
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
    <aside className="mx-auto w-full max-w-[420px]">
      <div className="relative aspect-[3/5] overflow-hidden rounded-[20px] bg-[#58c8cf] shadow-2xl">
        <div className="absolute left-3 top-2 z-[1] text-[150px] font-black leading-none text-[#08a83e] md:text-[190px]">
          2<span className="text-[#ffd400]">3</span>
        </div>
        <div className="absolute right-6 top-7 z-[2] text-4xl font-black text-white">FIFA</div>
        <div className="absolute right-[-8px] bottom-28 z-[2] [writing-mode:vertical-rl] text-7xl font-black text-transparent [-webkit-text-stroke:2px_rgba(255,255,255,.8)]">BRA</div>

        <div className="absolute left-1/2 top-[90px] z-[3] h-[42%] w-[76%] -translate-x-1/2 overflow-hidden rounded-[20px] bg-white/20">
          {form.foto_base64 ? (
            <img src={form.foto_base64} alt="Previa" className="h-full w-full object-cover blur-[1.3px] saturate-90" />
          ) : (
            <div className="flex h-full items-center justify-center text-center text-sm font-semibold text-primary/70">Envie uma foto</div>
          )}
          <div className="absolute inset-0 bg-black/10" />
        </div>

        <div className="absolute right-6 top-[67%] z-[4] flex h-10 w-14 items-center justify-center rounded-md border-2 border-white/60 bg-[#009c3b]">
          <div className="h-5 w-8 rotate-45 bg-[#ffdf00]" />
          <div className="absolute h-3 w-3 rounded-full bg-[#002776]" />
        </div>

        <div className="absolute left-5 right-5 bottom-[68px] z-[5] rounded-[20px] bg-[#087985]/90 px-5 py-4 text-white">
          <div className="text-3xl font-black uppercase leading-none">{name}</div>
          <div className="mt-2 text-lg font-semibold">{birth} | {height} | {weight}</div>
        </div>
        <div className="absolute bottom-5 left-5 right-5 z-[5] rounded-xl bg-[#0f7f89] p-2 text-center text-lg font-bold text-white">{club}</div>

        <div className="absolute inset-0 z-[8] bg-white/10 backdrop-blur-[1px]" />
        <div className="absolute left-1/2 top-1/2 z-[9] -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-2xl border-4 border-white/70 bg-black/25 px-8 py-3 text-center text-4xl font-black tracking-wider text-white/90">
          PREVIA
        </div>
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-orange-500 px-3 py-2 text-xs font-bold text-white">
          <Lock className="h-3 w-3" /> IA APOS O PIX
        </div>
      </div>
    </aside>
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
