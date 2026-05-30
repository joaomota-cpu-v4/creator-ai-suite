// Meta Pixel helpers
export const PIXEL_ID = "4001292026668330";

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
  }
}

export function fbqTrack(event: string, params?: Record<string, any>) {
  if (typeof window === "undefined") return;
  try {
    window.fbq?.("track", event, params);
  } catch {}
}
