import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adminListOrders, adminStats, claimAdmin, isAdmin } from "@/lib/admin.functions";
import { getPrice, setPrice } from "@/lib/settings.functions";
import { formatBRL } from "@/lib/price";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
          <p className="mt-2 text-sm text-muted-foreground">Se você é o dono, clique abaixo para se tornar o primeiro admin.</p>
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

        <Card className="mt-8 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">E-mail</th>
                <th className="p-3">Método</th>
                <th className="p-3">Status</th>
                <th className="p-3">Figurinha</th>
              </tr>
            </thead>
            <tbody>
              {(orders.data || []).map((o: any) => (
                <tr key={o.id} className="border-t">
                  <td className="p-3 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-3">{o.stickers?.nome}</td>
                  <td className="p-3">{o.stickers?.email}</td>
                  <td className="p-3">{o.metodo}</td>
                  <td className="p-3">
                    <Badge variant={o.status === "CONFIRMED" ? "default" : o.status === "FAILED" ? "destructive" : "secondary"}>{o.status}</Badge>
                  </td>
                  <td className="p-3">
                    {o.stickers?.figurinha_url ? <a className="text-primary underline" href={o.stickers.figurinha_url} target="_blank" rel="noreferrer">Ver</a> : "—"}
                  </td>
                </tr>
              ))}
              {!orders.data?.length && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum pedido ainda.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
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
