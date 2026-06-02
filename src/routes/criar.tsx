import { createFileRoute, redirect } from "@tanstack/react-router";

// Compat: /criar sozinho redireciona pra escolha de plano
export const Route = createFileRoute("/criar")({
  beforeLoad: () => { throw redirect({ to: "/planos" }); },
});
