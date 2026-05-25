import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/admin` } });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu e-mail.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/admin" });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: "var(--copa-yellow)" }}>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
        <h1 className="font-display text-3xl text-primary">{mode === "signin" ? "Entrar" : "Criar conta"} (Admin)</h1>
        <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
        <Button type="submit" disabled={loading} className="w-full bg-primary">{loading ? "..." : mode === "signin" ? "Entrar" : "Cadastrar"}</Button>
        <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="block w-full text-center text-xs text-primary/70 underline">
          {mode === "signin" ? "Não tenho conta" : "Já tenho conta"}
        </button>
      </form>
    </div>
  );
}
