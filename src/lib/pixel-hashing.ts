import { TRACKING_CONFIG } from "./tracking-config";

// Normaliza o e-mail: lowercase, trim, remover espaços extras
export function normalizeEmail(email?: string | null): string {
  if (!email) return "";
  return email.trim().toLowerCase();
}

// Normaliza o telefone: remover caracteres não numéricos
export function normalizePhone(phone?: string | null): string {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  // Se for Brasil e não começar com 55, opcionalmente podemos tratar, mas vamos apenas deixar limpo
  return cleaned;
}

// Normaliza nomes (nome, sobrenome, cidade, estado, etc): lowercase, trim, remover espaços duplos
export function normalizeText(text?: string | null): string {
  if (!text) return "";
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// Normaliza CEP: manter apenas números
export function normalizeZip(zip?: string | null): string {
  if (!zip) return "";
  return zip.replace(/\D/g, "");
}

// Normaliza o código do país: sempre ISO-2 em minúsculas (ex: "br")
export function normalizeCountry(country?: string | null): string {
  if (!country) return "";
  const clean = country.trim().toLowerCase();
  if (clean === "brasil") return "br";
  return clean.slice(0, 2);
}

// Função de hashing SHA-256 universal
// Detecta se está no servidor (Node/Bun) ou cliente (Browser) e aplica o hash correto
export async function sha256(value: string): Promise<string> {
  const cleanValue = value.trim();
  if (!cleanValue) return "";

  // Se estiver no servidor (Node/Bun)
  if (typeof window === "undefined") {
    try {
      const crypto = await import("crypto");
      return crypto.createHash("sha256").update(cleanValue).digest("hex");
    } catch (err) {
      if (TRACKING_CONFIG.DEBUG_MODE) {
        console.error("Erro ao importar modulo crypto no servidor:", err);
      }
    }
  }

  // Se estiver no cliente (Navegador) usando a API Web Crypto
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(cleanValue);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (err) {
    if (TRACKING_CONFIG.DEBUG_MODE) {
      console.error("Erro ao aplicar SHA-256 no cliente:", err);
    }
    return "";
  }
}

export interface RawUserData {
  email?: string | null;
  phone?: string | null;
  nome?: string | null;
  sobrenome?: string | null;
  cidade?: string | null;
  estado?: string | null;
  pais?: string | null;
  cep?: string | null;
  external_id?: string | null;
}

export interface HashedUserData {
  em?: string;
  ph?: string;
  fn?: string;
  ln?: string;
  ct?: string;
  st?: string;
  country?: string;
  zp?: string;
  external_id?: string;
}

// Retorna os dados do usuário prontos e criptografados em SHA-256
export async function getHashedUserData(raw: RawUserData): Promise<HashedUserData> {
  const hashed: HashedUserData = {};

  if (raw.email) hashed.em = await sha256(normalizeEmail(raw.email));
  if (raw.phone) hashed.ph = await sha256(normalizePhone(raw.phone));
  if (raw.nome) hashed.fn = await sha256(normalizeText(raw.nome));
  if (raw.sobrenome) hashed.ln = await sha256(normalizeText(raw.sobrenome));
  if (raw.cidade) hashed.ct = await sha256(normalizeText(raw.cidade));
  if (raw.estado) hashed.st = await sha256(normalizeText(raw.estado));
  if (raw.pais) hashed.country = await sha256(normalizeCountry(raw.pais));
  if (raw.cep) hashed.zp = await sha256(normalizeZip(raw.cep));
  
  // O external_id geralmente não precisa de hash, mas pode ser passado diretamente
  if (raw.external_id) {
    hashed.external_id = raw.external_id.trim();
  }

  return hashed;
}
