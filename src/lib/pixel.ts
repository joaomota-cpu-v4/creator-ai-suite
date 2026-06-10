// Meta Pixel helpers
export const PIXEL_ID = "4001292026668330";

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    dataLayer?: Array<Record<string, any>>;
  }
}

type PixelUserData = {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  externalId?: string | null;
};

type PixelTrackOptions = {
  eventId?: string | null;
};

function getCookie(name: string) {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

function getFbc() {
  if (typeof window === "undefined") return undefined;
  const existing = getCookie("_fbc");
  if (existing) return existing;

  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  if (!fbclid) return undefined;

  const fbc = `fb.1.${Date.now()}.${fbclid}`;
  document.cookie = `_fbc=${fbc}; path=/; max-age=${60 * 60 * 24 * 90}; SameSite=Lax`;
  return fbc;
}

function getPixelIds() {
  return {
    fbc: getFbc(),
    fbp: getCookie("_fbp"),
  };
}

export function getMetaAttribution() {
  if (typeof window === "undefined") return {};
  const { fbc, fbp } = getPixelIds();
  return {
    fbc,
    fbp,
    userAgent: window.navigator.userAgent,
  };
}

function cleanPhone(value?: string | null) {
  return value?.replace(/\D/g, "") || undefined;
}

function splitName(value?: string | null) {
  const parts = (value || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return {
    fn: parts[0],
    ln: parts.length > 1 ? parts[parts.length - 1] : undefined,
  };
}

function buildAdvancedMatching(userData?: PixelUserData) {
  if (!userData) return undefined;
  const { fn, ln } = splitName(userData.name);
  return {
    em: userData.email?.trim().toLowerCase() || undefined,
    ph: cleanPhone(userData.phone),
    fn,
    ln,
    external_id: userData.externalId || undefined,
  };
}

const GTM_EVENT_NAMES: Record<string, string> = {
  PageView: "page_view",
  ViewContent: "view_content",
  Lead: "lead",
  InitiateCheckout: "initiate_checkout",
  AddPaymentInfo: "add_payment_info",
  Purchase: "purchase",
};

function pushGtmEvent(event: string, params?: Record<string, any>, eventId?: string | null) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: GTM_EVENT_NAMES[event] || event,
    ...params,
    ...(eventId ? { event_id: eventId } : {}),
  });
}

export function fbqTrack(event: string, params?: Record<string, any>, userData?: PixelUserData, options?: PixelTrackOptions) {
  if (typeof window === "undefined") return;
  try {
    pushGtmEvent(event, params, options?.eventId);
    const matching = buildAdvancedMatching(userData);
    if (matching && Object.values(matching).some(Boolean)) {
      window.fbq?.("init", PIXEL_ID, matching);
    }
    const payload = {
      ...params,
      ...getPixelIds(),
    };
    if (options?.eventId) {
      window.fbq?.("track", event, payload, { eventID: options.eventId });
      return;
    }
    window.fbq?.("track", event, payload);
  } catch {}
}
