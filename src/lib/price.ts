import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPrice } from "./settings.functions";

export function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function usePrice() {
  const fetchPrice = useServerFn(getPrice);
  const q = useQuery({
    queryKey: ["app-price"],
    queryFn: () => fetchPrice(),
    staleTime: 60_000,
  });
  const cents = q.data?.price_centavos ?? 1290;
  return { cents, reais: cents / 100, formatted: formatBRL(cents), isLoading: q.isLoading };
}
