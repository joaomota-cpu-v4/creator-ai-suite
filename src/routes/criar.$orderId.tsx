import { createFileRoute, useNavigate, useParams, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { createSticker } from "@/lib/sticker.functions";
import { getOrderFull } from "@/lib/order.functions";
import { fbqTrack } from "@/lib/pixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Upload, ArrowRight, ArrowLeft, Loader2, Plus, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/criar/$orderId")({ component: Criar });

function Criar() {
  const { orderId } = useParams({ from: "/criar/$orderId" });
  const navigate = useNavigate();
  const create = useServerFn(createSticker);
  const fetchOrder = useServerFn(getOrderFull);
  const orderQ = useQuery({
    queryKey: ["order-full", orderId],
    queryFn: () => fetchOrder({ data: { id: orderId } }),
    refetchInterval: 4000,
  });

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nome: "", data_nascimento: "", clube: "", peso_kg: "", altura_cm: "", email: "", foto_base64: "",
  });

  const used = orderQ.data?.stickers.length ?? 0;
  const quantity = orderQ.data?.order.quantity ?? 1;
  const remaining = Math.max(0, quantity - used);
  const generated = orderQ.data?.stickers || [];

  const progress = step * 25;
  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const next = () => {
    if (step === 1 && !form.nome) return toast.error("Informe o nome");
    if (step === 2 && !form.foto_base64) return toast.error("Envie uma foto");
    if (step === 3 && !form.email) return toast.error("Informe o e-mail");
    setStep((s) => Math.min(4, s + 1));
  };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const onPhoto = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) return toast.error("Máximo 15MB");
    try { update("foto_base64", await compressImage(file, 768, 0.75)); }
    catch {
      const r = new FileReader();
      r.onload = () => update("foto_base64", r.result as string);
      r.readAsDataURL(file);
    }
  };
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

  const submit = async () => {
    setLoading(true);
    try {
      await create({
        data: {
          order_id: orderId,
          nome: form.nome, email: form.email,
          data_nascimento: form.data_nascimento || null,
          clube: form.clube || null,
          peso_kg: form.peso_kg ? Number(form.peso_kg) : null,
          altura_cm: form.altura_cm ? Number(form.altura_cm) : null,
          foto_base64: form.foto_base64,
        },
      });
      fbqTrack("Lead", { content_name: "Figurinha gerada" });
      await orderQ.refetch();
      if (remaining <= 1) {
        navigate({ to: "/oferta/$id", params: { id: orderId } });
      } else {
        setForm({ nome: "", data_nascimento: "", clube: "", peso_kg: "", altura_cm: "", email: form.email, foto_base64: "" });
        setStep(1);
        toast.success("Figurinha gerada! Faça mais uma.");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar figurinha");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <div className="container mx-auto max-w-xl px-4 py-8">
        <Card className="mb-4 p-3 text-center">
          <div className="text-xs text-muted-foreground">Figurinhas geradas</div>
          <div className="font-display text-2xl text-primary">{used} / {quantity}</div>
          <div className="text-xs text-muted-foreground">{remaining} restante{remaining !== 1 ? "s" : ""}</div>
        </Card>

        {generated.length > 0 && (
          <div className="mb-4 flex gap-2 overflow-x-auto">
            {generated.map((s) => (
              <div key={s.id} className="relative h-24 w-20 shrink-0 overflow-hidden rounded-lg border-2 border-white bg-white shadow">
                {s.preview_url ? <img src={s.preview_url} className="h-full w-full object-cover" alt={s.nome}/> : <Loader2 className="m-auto h-6 w-6 animate-spin"/>}
              </div>
            ))}
          </div>
        )}

        {remaining === 0 ? (
          <Card className="p-6 text-center">
            <Check className="mx-auto h-10 w-10 text-copa-green" />
            <h2 className="mt-2 font-display text-2xl text-primary">Todas as figurinhas geradas!</h2>
            <Button onClick={() => navigate({ to: "/oferta/$id", params: { id: orderId } })} className="mt-4 w-full bg-copa-green text-white">
              Continuar para pagamento <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Card>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-3">
              <span className="font-display text-xl text-primary">
                {used > 0 ? `Figurinha ${used + 1}` : "Passo"} {step}/4
              </span>
            </div>
            <Progress value={progress} className="h-3" />

            <div className="mt-6 rounded-3xl bg-white p-6 shadow-2xl md:p-8">
              {step === 1 && (
                <div className="space-y-4">
                  <h2 className="font-display text-3xl text-primary">Quem é o craque?</h2>
                  <div><Label>Nome</Label><Input value={form.nome} onChange={(e) => update("nome", e.target.value)} placeholder="Ex: Lucas"/></div>
                  <div><Label>Data de nascimento (opcional)</Label><Input type="date" value={form.data_nascimento} onChange={(e) => update("data_nascimento", e.target.value)}/></div>
                  <div><Label>Clube/Seleção favorito</Label><Input value={form.clube} onChange={(e) => update("clube", e.target.value)} placeholder="Ex: Brasil"/></div>
                </div>
              )}
              {step === 2 && (
                <div className="space-y-4">
                  <h2 className="font-display text-3xl text-primary">Envie uma foto</h2>
                  <p className="text-sm text-muted-foreground">Rosto bem visível, até 15MB.</p>
                  <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-primary/30 bg-secondary/30">
                    {form.foto_base64 ? <img src={form.foto_base64} className="h-full w-full object-cover" alt="preview"/> : (
                      <div className="text-center"><Upload className="mx-auto h-10 w-10 text-primary"/><p className="mt-2 font-medium text-primary">Clique para enviar</p></div>
                    )}
                    <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])}/>
                  </label>
                </div>
              )}
              {step === 3 && (
                <div className="space-y-4">
                  <h2 className="font-display text-3xl text-primary">Estatísticas</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Peso (kg)</Label><Input type="number" value={form.peso_kg} onChange={(e) => update("peso_kg", e.target.value)} placeholder="30"/></div>
                    <div><Label>Altura (cm)</Label><Input type="number" value={form.altura_cm} onChange={(e) => update("altura_cm", e.target.value)} placeholder="130"/></div>
                  </div>
                  <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="voce@email.com"/></div>
                </div>
              )}
              {step === 4 && (
                <div className="space-y-4 text-center">
                  <h2 className="font-display text-3xl text-primary">Gerar figurinha</h2>
                  <p className="text-muted-foreground">A IA cria em segundos.</p>
                  <Button size="lg" onClick={submit} disabled={loading} className="w-full bg-copa-red text-white">
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Gerando...</> : <>⚡ Gerar figurinha {used + 1}/{quantity}</>}
                  </Button>
                </div>
              )}
              {step < 4 && (
                <div className="mt-6 flex items-center justify-between">
                  <Button variant="ghost" onClick={back} disabled={step === 1}><ArrowLeft className="mr-1 h-4 w-4"/>Voltar</Button>
                  <Button onClick={next} className="bg-primary">Continuar <ArrowRight className="ml-1 h-4 w-4"/></Button>
                </div>
              )}
            </div>

            {used > 0 && (
              <button onClick={() => navigate({ to: "/oferta/$id", params: { id: orderId } })} className="mt-4 w-full text-center text-sm text-primary/80 underline">
                Finalizar e pagar agora
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
