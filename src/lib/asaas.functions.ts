import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ASAAS_BASE = "https://api-sandbox.asaas.com/v3"; // sandbox por padrão

async function asaas(path: string, init?: RequestInit) {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY não configurada");
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    ...init,
    headers: {
      "access_token": key,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    console.error("Asaas error", res.status, json);
    throw new Error(json?.errors?.[0]?.description || `Asaas ${res.status}`);
  }
  return json;
}

const CheckoutInput = z.object({
  sticker_id: z.string().uuid(),
  nome: z.string().min(2),
  cpf: z.string().min(11).max(14),
  email: z.string().email(),
  telefone: z.string().min(8).max(20),
  metodo: z.enum(["PIX", "CREDIT_CARD"]),
  card: z.object({
    holderName: z.string(),
    number: z.string(),
    expiryMonth: z.string(),
    expiryYear: z.string(),
    ccv: z.string(),
  }).optional(),
});

export const createAsaasPayment = createServerFn({ method: "POST" })
  .inputValidator((d) => CheckoutInput.parse(d))
  .handler(async ({ data }) => {
    // 1. Get/create customer
    const cpfClean = data.cpf.replace(/\D/g, "");
    const customer = await asaas("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: data.nome,
        cpfCnpj: cpfClean,
        email: data.email,
        mobilePhone: data.telefone.replace(/\D/g, ""),
      }),
    });

    // 2. Create payment
    const due = new Date();
    due.setDate(due.getDate() + 1);
    const dueDate = due.toISOString().slice(0, 10);

    const body: any = {
      customer: customer.id,
      billingType: data.metodo === "PIX" ? "PIX" : "CREDIT_CARD",
      value: 12.90,
      dueDate,
      description: "Figurinha personalizada Copa",
      externalReference: data.sticker_id,
    };
    if (data.metodo === "CREDIT_CARD" && data.card) {
      body.creditCard = {
        holderName: data.card.holderName,
        number: data.card.number.replace(/\s/g, ""),
        expiryMonth: data.card.expiryMonth,
        expiryYear: data.card.expiryYear,
        ccv: data.card.ccv,
      };
      body.creditCardHolderInfo = {
        name: data.nome,
        email: data.email,
        cpfCnpj: cpfClean,
        postalCode: "01001000",
        addressNumber: "0",
        phone: data.telefone.replace(/\D/g, ""),
      };
    }

    const payment = await asaas("/payments", { method: "POST", body: JSON.stringify(body) });

    let pixQr: string | null = null;
    let pixCopy: string | null = null;
    if (data.metodo === "PIX") {
      const qr = await asaas(`/payments/${payment.id}/pixQrCode`);
      pixQr = qr.encodedImage ? `data:image/png;base64,${qr.encodedImage}` : null;
      pixCopy = qr.payload || null;
    }

    const status = payment.status === "CONFIRMED" || payment.status === "RECEIVED" ? "CONFIRMED" : "PENDING";

    const { data: order, error } = await supabaseAdmin.from("orders").insert({
      sticker_id: data.sticker_id,
      asaas_payment_id: payment.id,
      valor_centavos: 1290,
      metodo: data.metodo,
      status,
      pix_qr_code: pixQr,
      pix_copy_paste: pixCopy,
      invoice_url: payment.invoiceUrl || null,
      cpf: cpfClean,
      telefone: data.telefone,
    }).select().single();
    if (error) throw new Error(error.message);

    if (status === "CONFIRMED") {
      await supabaseAdmin.from("stickers").update({ status: "paid" }).eq("id", data.sticker_id);
    }

    return { orderId: order.id, status, pixQr, pixCopy, invoiceUrl: payment.invoiceUrl || null };
  });
