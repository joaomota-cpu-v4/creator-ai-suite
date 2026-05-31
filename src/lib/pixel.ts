import { TRACKING_CONFIG } from "./tracking-config";
import { getHashedUserData, RawUserData } from "./pixel-hashing";

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: any;
  }
}

// Envia eventos para o Pixel do Facebook
// Exemplo: fbqTrack("Lead", { content_name: "Sticker" }, "uuid-1234", { email: "usuario@exemplo.com" })
export async function fbqTrack(
  event: string,
  params?: Record<string, any>,
  eventId?: string,
  rawUserData?: RawUserData
) {
  if (typeof window === "undefined" || !TRACKING_CONFIG.ENABLE_PIXEL) return;

  try {
    // Se foram fornecidos dados brutos do usuário para Advanced Matching
    if (rawUserData && window.fbq) {
      const hashedData = await getHashedUserData(rawUserData);
      // Re-inicializa o pixel com os dados do usuário para futuros eventos da sessão
      window.fbq("init", TRACKING_CONFIG.META_PIXEL_ID, hashedData);
    }

    if (window.fbq) {
      if (TRACKING_CONFIG.DEBUG_MODE) {
        console.log(`[Meta Pixel] Enviando evento '${event}'... Params:`, params, `eventId:`, eventId);
      }
      
      if (eventId) {
        window.fbq("track", event, params, { eventID: eventId });
      } else {
        window.fbq("track", event, params);
      }
    }
  } catch (error) {
    if (TRACKING_CONFIG.DEBUG_MODE) {
      console.error("[Meta Pixel] Erro ao disparar evento:", error);
    }
  }
}
export const PIXEL_ID = TRACKING_CONFIG.META_PIXEL_ID;
