import { TRACKING_CONFIG } from "./tracking-config";
import { getHashedUserData, RawUserData } from "./pixel-hashing";

interface CAPIOpts {
  eventName: string;
  eventId: string;
  eventSourceUrl?: string;
  request?: Request; // Se passado, extrai IP, User-Agent, fbp, fbc automaticamente
  userData?: RawUserData;
  customData?: {
    value?: number;
    currency?: string;
    content_name?: string;
    content_type?: string;
    content_ids?: string[];
    [key: string]: any;
  };
}

// Extrai cookies do cabeçalho da requisição
export function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie") || request.headers.get("cookie") || "";
  const cookies = cookieHeader.split(";");
  for (let c of cookies) {
    const [k, v] = c.trim().split("=");
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

// Envia um evento para a API de Conversões do Meta (CAPI)
export async function sendCAPIEvent(opts: CAPIOpts) {
  if (!TRACKING_CONFIG.ENABLE_CAPI) return;

  const accessToken = process.env.META_ACCESS_TOKEN;
  const pixelId = TRACKING_CONFIG.META_PIXEL_ID;

  if (!accessToken) {
    if (TRACKING_CONFIG.DEBUG_MODE) {
      console.warn("[Meta CAPI] META_ACCESS_TOKEN não está definido nas variáveis de ambiente. Abortando envio.");
    }
    return;
  }

  try {
    // 1. Extrair informações do cliente via Request
    let clientIpAddress = "";
    let clientUserAgent = "";
    let fbp = "";
    let fbc = "";

    if (opts.request) {
      const req = opts.request;
      // Extrair IP do cliente
      clientIpAddress = 
        req.headers.get("cf-connecting-ip") || 
        req.headers.get("x-real-ip") || 
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() || 
        "";
        
      clientUserAgent = req.headers.get("user-agent") || "";
      
      // Capturar fbp e fbc dos cookies
      fbp = getCookie(req, "_fbp") || "";
      fbc = getCookie(req, "_fbc") || "";
    }

    // 2. Preparar e Hashear os dados de Advanced Matching do Usuário
    const rawUser = opts.userData || {};
    const hashedUser = await getHashedUserData(rawUser);

    // 3. Montar objeto final de user_data
    const userDataPayload: Record<string, any> = {
      ...hashedUser,
    };

    if (clientIpAddress && clientIpAddress !== "127.0.0.1" && clientIpAddress !== "::1") {
      userDataPayload.client_ip_address = clientIpAddress;
    }
    if (clientUserAgent) {
      userDataPayload.client_user_agent = clientUserAgent;
    }
    if (fbp) {
      userDataPayload.fbp = fbp;
    }
    if (fbc) {
      userDataPayload.fbc = fbc;
    }

    // 4. Montar o evento conforme especificação do Meta
    const eventPayload: Record<string, any> = {
      event_name: opts.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: opts.eventId,
      event_source_url: opts.eventSourceUrl || opts.request?.url || "",
      action_source: "website",
      user_data: userDataPayload,
    };

    // Adiciona dados customizados (valores de compra, itens)
    if (opts.customData) {
      eventPayload.custom_data = opts.customData;
    }

    // Adiciona código de teste do Meta Event Manager se estiver ativo
    const payload: Record<string, any> = {
      data: [eventPayload],
    };

    if (TRACKING_CONFIG.TEST_EVENT_CODE) {
      payload.test_event_code = TRACKING_CONFIG.TEST_EVENT_CODE;
    }

    if (TRACKING_CONFIG.DEBUG_MODE) {
      console.log(`[Meta CAPI] Enviando evento '${opts.eventName}'... Payload:`, JSON.stringify(payload, null, 2));
    }

    // 5. Chamar a API do Meta
    const response = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const resJson = await response.json();

    if (TRACKING_CONFIG.DEBUG_MODE) {
      if (response.ok) {
        console.log(`[Meta CAPI] Evento '${opts.eventName}' enviado com sucesso! Resposta:`, resJson);
      } else {
        console.error(`[Meta CAPI] Erro ao enviar evento '${opts.eventName}':`, resJson);
      }
    }
  } catch (error) {
    if (TRACKING_CONFIG.DEBUG_MODE) {
      console.error(`[Meta CAPI] Erro catastrófico ao enviar evento:`, error);
    }
  }
}
