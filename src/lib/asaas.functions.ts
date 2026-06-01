import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ASAAS_BASE = "https://api.asaas.com/v3";

async function asaas(path: string, init?: RequestInit) {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY não configurada");
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    ...init,
    headers: {
      access_token: key,
      "Content-Type": "application/json",
      "User-Agent": "FigurinhaCopa/1.0",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    console.error("Asaas error", res.status, path, json);
    const msg = json?.errors?.[0]?.description || json?.raw || `Asaas ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function getOrCreateCustomer(input: { nome: string; cpfCnpj: string; email: string; phone: string }) {
  // Try find existing by cpfCnpj
  try {
    const list = await asaas(`/customers?cpfCnpj=${encodeURIComponent(input.cpfCnpj)}`);
    if (list?.data?.[0]?.id) return list.data[0];
  } catch (e) {
    console.warn("customer lookup failed, will create", e);
  }
  return asaas("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.nome,
      cpfCnpj: input.cpfCnpj,
      email: input.email,
      mobilePhone: input.phone,
    }),
  });
}

const CheckoutInput = z.object({
  sticker_id: z.string().uuid(),
  nome: z.string().min(2),
  cpf: z.string().min(11).max(20),
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
    const cpfClean = data.cpf.replace(/\D/g, "");
    const phoneClean = data.telefone.replace(/\D/g, "");

    if (cpfClean.length !== 11 && cpfClean.length !== 14) {
      throw new Error("CPF inválido. Digite 11 dígitos.");
    }

    const customer = await getOrCreateCustomer({
      nome: data.nome,
      cpfCnpj: cpfClean,
      email: data.email,
      phone: phoneClean,
    });

    const due = new Date();
    due.setDate(due.getDate() + 1);
    const dueDate = due.toISOString().slice(0, 10);

    const { data: settings } = await supabaseAdmin
      .from("app_settings").select("price_centavos").eq("id", true).maybeSingle();
    const priceCents = settings?.price_centavos ?? 1290;
    const priceReais = Math.round(priceCents) / 100;

    const body: any = {
      customer: customer.id,
      billingType: data.metodo === "PIX" ? "PIX" : "CREDIT_CARD",
      value: priceReais,
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
        phone: phoneClean,
      };
    }

    const payment = await asaas("/payments", { method: "POST", body: JSON.stringify(body) });

    let pixQr: string | null = null;
    let pixCopy: string | null = null;
    if (data.metodo === "PIX") {
      // Asaas às vezes leva 1-2s pra gerar o QR — tentamos algumas vezes, mas não bloqueamos
      for (let i = 0; i < 4; i++) {
        try {
          const qr = await asaas(`/payments/${payment.id}/pixQrCode`);
          pixQr = qr.encodedImage ? `data:image/png;base64,${qr.encodedImage}` : null;
          pixCopy = qr.payload || null;
          if (pixQr || pixCopy) break;
        } catch (e) {
          console.warn(`PIX QR tentativa ${i + 1} falhou`, e);
        }
        await new Promise((r) => setTimeout(r, 800));
      }
      // Se mesmo assim não veio, seguimos com invoiceUrl (link Asaas) como fallback
      if (!pixQr && !pixCopy && !payment.invoiceUrl) {
        throw new Error("Não foi possível gerar o PIX agora. Verifique se sua conta Asaas tem chave PIX cadastrada e tente novamente.");
      }
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
      telefone: phoneClean,
    }).select().single();
    if (error) throw new Error(error.message);

    if (status === "CONFIRMED") {
      await supabaseAdmin.from("stickers").update({ status: "paid" }).eq("id", data.sticker_id);
    }

    return { orderId: order.id, status, pixQr, pixCopy, invoiceUrl: payment.invoiceUrl || null };
  });

// Polling fallback: checa status no Asaas para pedidos pendentes
export const checkOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ stickerId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, asaas_payment_id, status, sticker_id")
      .eq("sticker_id", data.stickerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!order || order.status === "CONFIRMED" || !order.asaas_payment_id) return { status: order?.status || null };

    try {
      const p = await asaas(`/payments/${order.asaas_payment_id}`);
      if (p.status === "CONFIRMED" || p.status === "RECEIVED") {
        const { data: updated } = await supabaseAdmin
          .from("orders")
          .update({ status: "CONFIRMED" })
          .eq("id", order.id)
          .eq("status", "PENDING")
          .select()
          .maybeSingle();
        if (updated) {
          await supabaseAdmin.from("stickers").update({ status: "paid" }).eq("id", order.sticker_id);
        }
        return { status: "CONFIRMED" };
      }
    } catch (e) {
      console.error("checkOrderStatus failed", e);
    }
    return { status: order.status };
  });
