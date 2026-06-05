import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deliverOrder } from "./delivery.server";
import { resolveOrderId } from "./order.functions";
import { generateMissingStickersForOrder } from "./sticker.functions";
import { sendMetaPurchase } from "./meta-conversions.server";

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
  try {
    const list = await asaas(`/customers?cpfCnpj=${encodeURIComponent(input.cpfCnpj)}`);
    if (list?.data?.[0]?.id) return list.data[0];
  } catch (e) { console.warn("customer lookup failed, will create", e); }
  return asaas("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.nome, cpfCnpj: input.cpfCnpj, email: input.email, mobilePhone: input.phone,
    }),
  });
}

const CheckoutInput = z.object({
  // aceita orderId OU stickerId legacy
  order_id: z.string().uuid().optional(),
  sticker_id: z.string().uuid().optional(),
  nome: z.string().min(2),
  cpf: z.string().min(11).max(20),
  email: z.string().email(),
  telefone: z.string().min(8).max(20),
  metodo: z.enum(["PIX", "CREDIT_CARD"]),
  meta: z.object({
    fbc: z.string().optional().nullable(),
    fbp: z.string().optional().nullable(),
    userAgent: z.string().optional().nullable(),
  }).optional(),
  card: z.object({
    holderName: z.string(), number: z.string(),
    expiryMonth: z.string(), expiryYear: z.string(), ccv: z.string(),
  }).optional(),
}).refine((d) => d.order_id || d.sticker_id, { message: "order_id ou sticker_id obrigatório" });

function mapAsaasPaymentStatus(status?: string): "PENDING" | "CONFIRMED" | "FAILED" | "REFUNDED" {
  if (status === "CONFIRMED" || status === "RECEIVED" || status === "RECEIVED_IN_CASH") return "CONFIRMED";
  if (status === "REFUNDED") return "REFUNDED";
  if (["DELETED", "CANCELLED", "OVERDUE", "CHARGEBACK_REQUESTED", "REFUND_DENIED"].includes(status || "")) return "FAILED";
  return "PENDING";
}

function hasValidCard(card: z.infer<typeof CheckoutInput>["card"]) {
  return !!card
    && card.holderName.trim().length >= 2
    && card.number.replace(/\D/g, "").length >= 13
    && card.expiryMonth.replace(/\D/g, "").length >= 1
    && card.expiryYear.replace(/\D/g, "").length >= 2
    && card.ccv.replace(/\D/g, "").length >= 3;
}

async function saveMetaAttribution(orderId: string, meta?: z.infer<typeof CheckoutInput>["meta"]) {
  if (!meta?.fbc && !meta?.fbp && !meta?.userAgent) return;
  const { error } = await supabaseAdmin
    .from("orders")
    .update({
      meta_fbc: meta?.fbc || null,
      meta_fbp: meta?.fbp || null,
      meta_user_agent: meta?.userAgent || null,
    })
    .eq("id", orderId);
  if (error) {
    console.warn("[meta] attribution not saved; apply Supabase migration to store fbc/fbp", error.message);
  }
}

export const createAsaasPayment = createServerFn({ method: "POST" })
  .inputValidator((d) => CheckoutInput.parse(d))
  .handler(async ({ data }) => {
    const cpfClean = data.cpf.replace(/\D/g, "");
    const phoneClean = data.telefone.replace(/\D/g, "");
    if (cpfClean.length !== 11 && cpfClean.length !== 14) {
      throw new Error("CPF inválido. Digite 11 dígitos.");
    }
    if (data.metodo === "CREDIT_CARD" && !hasValidCard(data.card)) {
      throw new Error("Preencha todos os dados do cartão.");
    }

    const orderId = data.order_id || (await resolveOrderId(data.sticker_id!));
    if (!orderId) throw new Error("Pedido não encontrado");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, status, sticker_id, plan_id, quantity, valor_centavos, metodo, asaas_payment_id, pix_qr_code, pix_copy_paste, invoice_url")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) throw new Error("Pedido não encontrado");
    if (order.status === "CONFIRMED") {
      return { orderId: order.id, status: "CONFIRMED", pixQr: null, pixCopy: null, invoiceUrl: null };
    }
    if (
      data.metodo === "PIX"
      && order.status === "PENDING"
      && order.metodo === "PIX"
      && order.asaas_payment_id
      && (order.pix_qr_code || order.pix_copy_paste || order.invoice_url)
    ) {
      console.log("[pagamento] reutilizando PIX pendente", { orderId: order.id, paymentId: order.asaas_payment_id });
      await supabaseAdmin.from("orders").update({
        cpf: cpfClean,
        telefone: phoneClean,
        nome: data.nome,
        email: data.email,
      }).eq("id", order.id);
      await saveMetaAttribution(order.id, data.meta);
      return {
        orderId: order.id,
        status: "PENDING",
        pixQr: order.pix_qr_code,
        pixCopy: order.pix_copy_paste,
        invoiceUrl: order.invoice_url,
      };
    }

    // valor vem do pedido (que foi setado pelo plano)
    const priceCents = order.valor_centavos || 1290;
    const priceReais = Math.round(priceCents) / 100;

    const customer = await getOrCreateCustomer({
      nome: data.nome, cpfCnpj: cpfClean, email: data.email, phone: phoneClean,
    });

    const due = new Date(); due.setDate(due.getDate() + 1);
    const dueDate = due.toISOString().slice(0, 10);

    const body: any = {
      customer: customer.id,
      billingType: data.metodo === "PIX" ? "PIX" : "CREDIT_CARD",
      value: priceReais,
      dueDate,
      description: `Figurinha Copa — pedido ${order.id.slice(0, 8)}`,
      externalReference: order.id,
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
        name: data.nome, email: data.email, cpfCnpj: cpfClean,
        postalCode: "01001000", addressNumber: "0", phone: phoneClean,
      };
    }

    const payment = await asaas("/payments", { method: "POST", body: JSON.stringify(body) });

    let pixQr: string | null = null;
    let pixCopy: string | null = null;
    if (data.metodo === "PIX") {
      for (let i = 0; i < 4; i++) {
        try {
          const qr = await asaas(`/payments/${payment.id}/pixQrCode`);
          pixQr = qr.encodedImage ? `data:image/png;base64,${qr.encodedImage}` : null;
          pixCopy = qr.payload || null;
          if (pixQr || pixCopy) break;
        } catch (e) { console.warn(`PIX QR tentativa ${i + 1} falhou`, e); }
        await new Promise((r) => setTimeout(r, 800));
      }
      if (!pixQr && !pixCopy && !payment.invoiceUrl) {
        throw new Error("Não foi possível gerar o PIX agora. Verifique se sua conta Asaas tem chave PIX cadastrada.");
      }
    }

    const status = mapAsaasPaymentStatus(payment.status);
    console.log("[pagamento] criado", {
      orderId: order.id,
      paymentId: payment.id,
      metodo: data.metodo,
      asaasStatus: payment.status,
      status,
      value: priceReais,
    });

    const { error } = await supabaseAdmin.from("orders").update({
      asaas_payment_id: payment.id,
      metodo: data.metodo,
      status,
      pix_qr_code: pixQr,
      pix_copy_paste: pixCopy,
      invoice_url: payment.invoiceUrl || null,
      cpf: cpfClean,
      telefone: phoneClean,
      nome: data.nome,
      email: data.email,
    }).eq("id", order.id);
    if (error) throw new Error(error.message);
    await saveMetaAttribution(order.id, data.meta);

    if (status === "CONFIRMED") {
      console.log("[pagamento] confirmado imediatamente", order.id);
      sendMetaPurchase({
        id: order.id,
        email: data.email,
        telefone: phoneClean,
        nome: data.nome,
        valor_centavos: priceCents,
        meta_fbc: data.meta?.fbc || null,
        meta_fbp: data.meta?.fbp || null,
        meta_user_agent: data.meta?.userAgent || null,
      }, "asaas_create_payment").catch((e) => console.error("[meta] async err", e));
      try {
        await generateMissingStickersForOrder(order.id);
        await supabaseAdmin.from("stickers").update({ status: "paid" }).eq("order_id", order.id);
      } catch (e) {
        console.error("[sticker] geraÃ§Ã£o pÃ³s-pagamento falhou", e);
      } finally {
        deliverOrder(order.id).catch((e) => console.error("[delivery] async err", e));
      }
    }

    return { orderId: order.id, status, pixQr, pixCopy, invoiceUrl: payment.invoiceUrl || null };
  });

export const checkOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const orderId = await resolveOrderId(data.id);
    if (!orderId) return { status: null };
    const { data: order } = await supabaseAdmin
      .from("orders").select("*").eq("id", orderId).maybeSingle();
    if (!order || order.status === "CONFIRMED" || !order.asaas_payment_id) return { status: order?.status || null };

    try {
      const p = await asaas(`/payments/${order.asaas_payment_id}`);
      const status = mapAsaasPaymentStatus(p.status);
      if (status === "CONFIRMED") {
        const { data: updated } = await supabaseAdmin
          .from("orders").update({ status: "CONFIRMED" })
          .eq("id", order.id).eq("status", "PENDING").select().maybeSingle();
        if (updated) {
          console.log("[pagamento] confirmado via polling", order.id);
          sendMetaPurchase(order, "asaas_polling").catch((e) => console.error("[meta] async err", e));
          try {
            await generateMissingStickersForOrder(order.id);
            await supabaseAdmin.from("stickers").update({ status: "paid" }).eq("order_id", order.id);
          } catch (e) {
            console.error("[sticker] geraÃ§Ã£o pÃ³s-pagamento falhou", e);
          } finally {
            deliverOrder(order.id).catch((e) => console.error("[delivery] async err", e));
          }
        }
        return { status: "CONFIRMED" };
      }
      if (status === "FAILED" || status === "REFUNDED") {
        await supabaseAdmin
          .from("orders")
          .update({ status })
          .eq("id", order.id)
          .eq("status", "PENDING");
        return { status };
      }
    } catch (e) {
      console.error("checkOrderStatus failed", e);
    }
    return { status: order.status };
  });
