import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adminListOrders, adminStats, claimAdmin, isAdmin } from "@/lib/admin.functions";
import { adminListPlans, upsertPlan, deletePlan } from "@/lib/plans.functions";
import { listWebhookLogs, resendWebhook, resendAllFailed, testWebhook } from "@/lib/webhooks.functions";
import { getAiStatus, setAiProvider, listAiLogs } from "@/lib/ai.functions";
import { formatBRL } from "@/lib/price";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Plus, RefreshCw, Trash2, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({ component: Admin });

function Admin() {
  const navigate = useNavigate();
  const check = useServerFn(isAdmin);
  const claim = useServerFn(claimAdmin);
  const listOrders = useServerFn(adminListOrders);
  const stats = useServerFn(adminStats);

  const me = useQuery({ queryKey: ["isAdmin"], queryFn: () => check() });
  const orders = useQuery({ queryKey: ["adminOrders"], queryFn: () => listOrders(), enabled: me.data?.admin });
  const s = useQuery({ queryKey: ["adminStats"], queryFn: () => stats(), enabled: me.data?.admin });

  if (me.isLoading) return <div className="p-8">Carregando...</div>;

  if (!me.data?.admin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ backgroundColor: "var(--copa-yellow)" }}>
        <Card className="w-full max-w-md p-6 text-center">
          <h1 className="font-display text-2xl text-primary">Você ainda não é admin</h1>
          <Button className="mt-4 w-full bg-primary" onClick={async () => {
            try { await claim({ data: {} }); me.refetch(); toast.success("Agora você é admin"); } catch (e: any) { toast.error(e.message); }
          }}>Tornar-me admin</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/20">
      <header className="bg-primary px-6 py-4 text-primary-foreground">
        <div className="container mx-auto flex items-center justify-between">
          <h1 className="font-display text-2xl">Painel Admin · Figurinha Copa</h1>
          <Button variant="secondary" size="sm" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/login" }); }}>Sair</Button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="grid gap-4 md:grid-cols-3">
          <Stat label="Pedidos" value={s.data?.total ?? "-"} />
          <Stat label="Pagos" value={s.data?.paid ?? "-"} />
          <Stat label="Receita" value={s.data ? `R$ ${(s.data.revenueCents / 100).toFixed(2)}` : "-"} />
        </div>

        <Tabs defaultValue="pedidos" className="mt-8">
          <TabsList>
            <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
            <TabsTrigger value="planos">Planos</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="ia">IA</TabsTrigger>
          </TabsList>

          <TabsContent value="pedidos">
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-3">Data</th><th className="p-3">Cliente</th><th className="p-3">E-mail</th>
                    <th className="p-3">Plano</th><th className="p-3">Status</th><th className="p-3">Valor</th><th className="p-3">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {(orders.data || []).map((o: any) => {
                    const firstSticker = o.first_sticker || o.stickers;
                    const customerName = o.nome || firstSticker?.nome || o.id.slice(0,8);
                    const customerEmail = o.email || firstSticker?.email || "-";
                    const paid = o.status === "CONFIRMED";
                    const failed = o.status === "FAILED";
                    const stickerLinks = (o.sticker_list || []).filter((s: any) => s.figurinha_url);
                    return (
                      <tr key={o.id} className="border-t">
                        <td className="p-3 text-xs">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                        <td className="p-3">{customerName}</td>
                        <td className="p-3">{customerEmail}</td>
                        <td className="p-3 text-xs">
                          <div>{o.plans?.name || "-"}</div>
                          <div className="text-muted-foreground">{o.sticker_count || 0}/{o.quantity || 0} geradas</div>
                        </td>
                        <td className="p-3">
                          <Badge variant={paid ? "default" : failed ? "destructive" : "secondary"}>
                            {paid ? "Pago" : failed ? "Falhou" : "Pendente"}
                          </Badge>
                          <div className="mt-1 text-xs text-muted-foreground">{o.metodo}</div>
                        </td>
                        <td className="p-3 font-semibold">{formatBRL(o.valor_centavos || 0)}</td>
                        <td className="p-3">
                          {stickerLinks.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {stickerLinks.map((s: any, index: number) => (
                                <Button key={s.id} asChild size="sm" variant="outline">
                                  <a href={s.figurinha_url} target="_blank" rel="noreferrer" download>
                                    <Download className="mr-1 h-3 w-3"/>#{index + 1}
                                  </a>
                                </Button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem imagem</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </TabsContent>

          <TabsContent value="planos"><PlanosEditor/></TabsContent>
          <TabsContent value="webhooks"><WebhooksPanel/></TabsContent>
          <TabsContent value="ia"><IAPanel/></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function PlanosEditor() {
  const list = useServerFn(adminListPlans);
  const save = useServerFn(upsertPlan);
  const del = useServerFn(deletePlan);
  const q = useQuery({ queryKey: ["adminPlans"], queryFn: () => list() });
  const [drafts, setDrafts] = useState<Record<string, any>>({});

  useEffect(() => {
    if (q.data) {
      const d: any = {};
      q.data.forEach((p) => d[p.id] = { ...p });
      setDrafts(d);
    }
  }, [q.data]);

  const update = (id: string, patch: any) => setDrafts((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const saveOne = async (id: string) => {
    const p = drafts[id];
    try {
      await save({ data: {
        id: p.id, name: p.name, slug: p.slug,
        quantity: Number(p.quantity), price_centavos: Number(p.price_centavos),
        active: !!p.active, sort_order: Number(p.sort_order),
      }});
      toast.success("Salvo");
      q.refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este plano?")) return;
    try { await del({ data: { id } }); toast.success("Excluído"); q.refetch(); }
    catch (e: any) { toast.error(e.message); }
  };

  const addNew = async () => {
    try {
      await save({ data: {
        name: "Novo plano", slug: "novo-" + Date.now(),
        quantity: 1, price_centavos: 1000, active: true, sort_order: 99,
      }});
      q.refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl text-primary">Planos</h2>
        <Button onClick={addNew} size="sm"><Plus className="mr-1 h-4 w-4"/>Novo</Button>
      </div>
      <div className="space-y-3">
        {Object.values(drafts).map((p: any) => (
          <div key={p.id} className="grid grid-cols-1 items-end gap-2 rounded-lg border p-3 md:grid-cols-7">
            <div><Label>Nome</Label><Input value={p.name} onChange={(e) => update(p.id, { name: e.target.value })}/></div>
            <div><Label>Slug</Label><Input value={p.slug} onChange={(e) => update(p.id, { slug: e.target.value })}/></div>
            <div><Label>Qtd</Label><Input type="number" value={p.quantity} onChange={(e) => update(p.id, { quantity: e.target.value })}/></div>
            <div><Label>Preço (centavos)</Label><Input type="number" value={p.price_centavos} onChange={(e) => update(p.id, { price_centavos: e.target.value })}/></div>
            <div><Label>Ordem</Label><Input type="number" value={p.sort_order} onChange={(e) => update(p.id, { sort_order: e.target.value })}/></div>
            <div className="flex items-center gap-2"><Switch checked={!!p.active} onCheckedChange={(v) => update(p.id, { active: v })}/><span className="text-xs">{p.active ? "Ativo" : "Inativo"}</span></div>
            <div className="flex gap-1">
              <Button size="sm" onClick={() => saveOne(p.id)}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function WebhooksPanel() {
  const [filter, setFilter] = useState<"all"|"success"|"failed">("all");
  const list = useServerFn(listWebhookLogs);
  const resend = useServerFn(resendWebhook);
  const resendAll = useServerFn(resendAllFailed);
  const test = useServerFn(testWebhook);
  const q = useQuery({ queryKey: ["webhookLogs", filter], queryFn: () => list({ data: { filter } }) });

  const doTest = async () => {
    try { const r = await test({ data: {} }); toast.success(`HTTP ${r.status} em ${r.ms}ms`); q.refetch(); }
    catch (e: any) { toast.error(e.message); }
  };
  const doResend = async (orderId: string) => {
    try { await resend({ data: { orderId } }); toast.success("Reenviado"); q.refetch(); }
    catch (e: any) { toast.error(e.message); }
  };
  const doResendAll = async (days?: number) => {
    try { const r = await resendAll({ data: days ? { withinDays: days } : {} }); toast.success(`${r.tried} pedidos reenviados`); q.refetch(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Todos</Button>
          <Button size="sm" variant={filter === "success" ? "default" : "outline"} onClick={() => setFilter("success")}>Sucesso</Button>
          <Button size="sm" variant={filter === "failed" ? "default" : "outline"} onClick={() => setFilter("failed")}>Falhas</Button>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={doTest}><Zap className="mr-1 h-3 w-3"/>Testar</Button>
          <Button size="sm" variant="outline" onClick={() => doResendAll(1)}>Reenviar falhas 24h</Button>
          <Button size="sm" variant="outline" onClick={() => doResendAll(7)}>7 dias</Button>
          <Button size="sm" variant="outline" onClick={() => doResendAll()}>Tudo</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr>
            <th className="p-2">Data</th><th className="p-2">Pedido</th><th className="p-2">Cliente</th>
            <th className="p-2">Evento</th><th className="p-2">Status</th><th className="p-2">HTTP</th>
            <th className="p-2">Tent.</th><th className="p-2"/>
          </tr></thead>
          <tbody>
            {(q.data || []).map((l: any) => (
              <tr key={l.id} className="border-t">
                <td className="p-2 text-xs">{new Date(l.created_at).toLocaleString("pt-BR")}</td>
                <td className="p-2 font-mono text-xs">{l.order_id?.slice(0,8)}</td>
                <td className="p-2">{l.orders?.nome} · {l.orders?.email}</td>
                <td className="p-2">{l.event_type}</td>
                <td className="p-2"><Badge variant={l.success ? "default" : "destructive"}>{l.success ? "OK" : "FALHA"}</Badge></td>
                <td className="p-2">{l.response_status ?? "-"}</td>
                <td className="p-2">{l.attempts}</td>
                <td className="p-2">
                  {l.order_id && (
                    <Button size="sm" variant="outline" onClick={() => doResend(l.order_id)}>
                      <RefreshCw className="mr-1 h-3 w-3"/>Reenviar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!q.data?.length && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nenhum webhook ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function IAPanel() {
  const status = useServerFn(getAiStatus);
  const setProv = useServerFn(setAiProvider);
  const logs = useServerFn(listAiLogs);
  const sq = useQuery({ queryKey: ["aiStatus"], queryFn: () => status({ data: {} }), refetchInterval: 10000 });
  const lq = useQuery({ queryKey: ["aiLogs"], queryFn: () => logs({ data: { limit: 50 } }), refetchInterval: 10000 });

  const change = async (provider: "OPENAI" | "GEMINI") => {
    try { await setProv({ data: { provider } }); toast.success(`Provider: ${provider}`); sq.refetch(); }
    catch (e: any) { toast.error(e.message); }
  };
  const toggleFallback = async (v: boolean) => {
    const current = sq.data?.provider || "GEMINI";
    try { await setProv({ data: { provider: current, fallback: v } }); sq.refetch(); }
    catch (e: any) { toast.error(e.message); }
  };

  const s = sq.data;

  return (
    <Card className="p-5 space-y-5">
      <div>
        <h2 className="font-display text-xl text-primary mb-3">Provedor de IA</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={s?.provider === "GEMINI" ? "default" : "outline"} onClick={() => change("GEMINI")}>
            GEMINI {s?.hasGeminiKey ? "✓" : "⚠"}
          </Button>
          <Button size="sm" variant={s?.provider === "OPENAI" ? "default" : "outline"} onClick={() => change("OPENAI")}>
            OPENAI {s?.hasOpenAIKey ? "✓" : "⚠"}
          </Button>
          <div className="ml-4 flex items-center gap-2">
            <Switch checked={!!s?.fallback} onCheckedChange={toggleFallback}/>
            <span className="text-sm">Fallback automático</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          As chaves <code>OPENAI_API_KEY</code> e <code>GEMINI_API_KEY</code> são gerenciadas em Secrets.
          {!s?.hasOpenAIKey && " ⚠ OPENAI_API_KEY ausente."}
          {!s?.hasGeminiKey && " ⚠ GEMINI_API_KEY ausente."}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Sucessos (24h)" value={s?.ok24h ?? "-"} />
        <Stat label="Erros (24h)" value={s?.errors24h ?? "-"} />
        <Stat label="Última geração" value={s?.last ? `${s.last.provider} · ${s.last.success ? "OK" : "FALHA"}` : "-"} />
      </div>

      <div>
        <h3 className="font-display text-lg text-primary mb-2">Logs recentes</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left"><tr>
              <th className="p-2">Data</th><th className="p-2">Provider</th><th className="p-2">Modelo</th>
              <th className="p-2">Status</th><th className="p-2">Duração</th><th className="p-2">Fallback</th>
              <th className="p-2">Erro</th>
            </tr></thead>
            <tbody>
              {(lq.data || []).map((l: any) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2 text-xs">{new Date(l.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-2">{l.provider}</td>
                  <td className="p-2 text-xs">{l.model || "-"}</td>
                  <td className="p-2"><Badge variant={l.success ? "default" : "destructive"}>{l.success ? "OK" : "FALHA"}</Badge></td>
                  <td className="p-2">{l.duration_ms}ms</td>
                  <td className="p-2">{l.fallback_used ? "sim" : "-"}</td>
                  <td className="p-2 text-xs text-destructive truncate max-w-[300px]">{l.error || ""}</td>
                </tr>
              ))}
              {!lq.data?.length && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Sem registros.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl text-primary">{value}</div>
    </Card>
  );
}
