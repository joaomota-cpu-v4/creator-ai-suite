import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createSticker } from "@/lib/sticker.functions";
import { fbqTrack } from "@/lib/pixel";
import { usePrice } from "@/lib/price";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Upload, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/criar")({ component: Criar });

function Criar() {
  const navigate = useNavigate();
  const create = useServerFn(createSticker);
  const price = usePrice();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    data_nascimento: "",
    clube: "",
    peso_kg: "",
    altura_cm: "",
    email: "",
    foto_base64: "",
  });

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
    try {
      const compressed = await compressImage(file, 1024, 0.82);
      update("foto_base64", compressed);
    } catch {
      const r = new FileReader();
      r.onload = () => update("foto_base64", r.result as string);
      r.readAsDataURL(file);
    }
  };

  const compressImage = (file: File, maxSide: number, quality: number) =>
    new Promise<string>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
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
      const res = await create({
        data: {
          nome: form.nome,
          email: form.email,
          data_nascimento: form.data_nascimento || null,
          clube: form.clube || null,
          peso_kg: form.peso_kg ? Number(form.peso_kg) : null,
          altura_cm: form.altura_cm ? Number(form.altura_cm) : null,
          foto_base64: form.foto_base64,
        },
      });
      fbqTrack("Lead", { content_name: "Figurinha gerada", value: 12.9, currency: "BRL" });
      navigate({ to: "/oferta/$id", params: { id: res.id } });
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar figurinha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <div className="container mx-auto max-w-xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="font-display text-2xl text-primary">Passo {step} de 4</span>
        </div>
        <Progress value={progress} className="h-3" />

        <div className="mt-8 rounded-3xl bg-white p-6 shadow-2xl md:p-8">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-display text-3xl text-primary">Quem é o craque?</h2>
              <div>
                <Label htmlFor="nome">Nome da criança</Label>
                <Input id="nome" value={form.nome} onChange={(e) => update("nome", e.target.value)} placeholder="Ex: Lucas" />
              </div>
              <div>
                <Label htmlFor="dn">Data de nascimento (opcional)</Label>
                <Input id="dn" type="date" value={form.data_nascimento} onChange={(e) => update("data_nascimento", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="clube">Clube/Seleção favorito</Label>
                <Input id="clube" value={form.clube} onChange={(e) => update("clube", e.target.value)} placeholder="Ex: Brasil, Flamengo" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-display text-3xl text-primary">Envie uma foto</h2>
              <p className="text-sm text-muted-foreground">Foto recente, rosto bem visível. PNG ou JPG até 8MB.</p>
              <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-primary/30 bg-secondary/30 hover:bg-secondary/50">
                {form.foto_base64 ? (
                  <img src={form.foto_base64} alt="preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="text-center">
                    <Upload className="mx-auto h-10 w-10 text-primary" />
                    <p className="mt-2 font-medium text-primary">Clique para enviar</p>
                  </div>
                )}
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-display text-3xl text-primary">Estatísticas do craque</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="peso">Peso (kg)</Label>
                  <Input id="peso" type="number" value={form.peso_kg} onChange={(e) => update("peso_kg", e.target.value)} placeholder="30" />
                </div>
                <div>
                  <Label htmlFor="alt">Altura (cm)</Label>
                  <Input id="alt" type="number" value={form.altura_cm} onChange={(e) => update("altura_cm", e.target.value)} placeholder="130" />
                </div>
              </div>
              <div>
                <Label htmlFor="email">E-mail para receber a figurinha</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="voce@email.com" />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 text-center">
              <h2 className="font-display text-3xl text-primary">Pronto pra gerar!</h2>
              <p className="text-muted-foreground">A IA vai criar a figurinha em alguns segundos. Você verá um preview antes de pagar.</p>
              <div className="rounded-2xl bg-secondary/40 p-4 text-left text-sm">
                <div><b>Nome:</b> {form.nome}</div>
                {form.clube && <div><b>Clube:</b> {form.clube}</div>}
                <div><b>E-mail:</b> {form.email}</div>
              </div>
              <Button size="lg" onClick={submit} disabled={loading} className="w-full bg-copa-red text-white hover:bg-copa-red/90">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando...</> : "⚡ Gerar minha figurinha"}
              </Button>
            </div>
          )}

          {step < 4 && (
            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" onClick={back} disabled={step === 1}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
              <Button onClick={next} className="bg-primary text-primary-foreground">
                Continuar <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
