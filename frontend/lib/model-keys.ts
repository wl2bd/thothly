import type { LlmConfig, VisitorEndpoint } from "@/lib/api";

// The visitor's own model and transcription keys. They live in this browser
// only: the backend sees a key when it's checked and when a compilation starts,
// and never stores it (see docs/superpowers/specs/2026-08-27-byok-llm-settings-design.md).

export interface StoredEndpoint {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string; // only for "custom", a self-hosted server
}

export interface StoredModels {
  llm: StoredEndpoint | null;
  stt: StoredEndpoint | null;
}

// Versioned so a later shape change reads as "nothing stored" instead of
// feeding this build data it can't use.
const KEY = "thothly.models.v1";
export const MODELS_CHANGED = "thothly:models-changed";

const NONE: StoredModels = { llm: null, stt: null };

function isEndpoint(value: unknown): value is StoredEndpoint {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  if (typeof e.provider !== "string" || !e.provider) return false;
  if (typeof e.model !== "string" || !e.model) return false;
  if (typeof e.apiKey !== "string") return false;
  if (e.baseUrl !== undefined && typeof e.baseUrl !== "string") return false;
  // A self-hosted server may need no key but needs an address; every listed
  // provider needs a key.
  return e.provider === "custom" ? !!e.baseUrl : !!e.apiKey;
}

export function parseModels(raw: string | null): StoredModels {
  if (!raw) return NONE;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return NONE;
    const d = data as Record<string, unknown>;
    return {
      llm: isEndpoint(d.llm) ? d.llm : null,
      stt: isEndpoint(d.stt) ? d.stt : null,
    };
  } catch {
    return NONE;
  }
}

export function readModelsRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeModels(models: StoredModels): void {
  try {
    if (!models.llm && !models.stt) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(models));
  } catch {
    // Storage blocked (private mode): the key simply isn't remembered.
  }
  // `storage` only fires in OTHER tabs; this tells the current one.
  window.dispatchEvent(new Event(MODELS_CHANGED));
}

// Enough to recognise a key without showing it: "sk-...4f2c".
export function maskKey(key: string): string {
  if (!key) return "No key";
  if (key.length < 9) return "••••";
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

export function toVisitorEndpoint(e: StoredEndpoint): VisitorEndpoint {
  return { provider: e.provider, api_key: e.apiKey, model: e.model, base_url: e.baseUrl };
}

// The server's answer, corrected by what this browser holds: a stored key makes
// the path available, and the estimate quotes the visitor's provider rather
// than the operator's config.
export function withBrowserModels(
  llm: LlmConfig | null,
  models: StoredModels,
): LlmConfig | null {
  if (!llm || (!models.llm && !models.stt)) return llm;
  const rates = (e: StoredEndpoint | null) =>
    e ? llm.providers.find((p) => p.id === e.provider) : undefined;
  const lp = rates(models.llm);
  const sp = rates(models.stt);
  return {
    ...llm,
    available: llm.available || !!models.llm,
    stt_available: llm.stt_available || !!models.stt,
    pricing: {
      llm_per_mtok_in: lp?.llm_per_mtok_in ?? llm.pricing.llm_per_mtok_in,
      llm_per_mtok_out: lp?.llm_per_mtok_out ?? llm.pricing.llm_per_mtok_out,
      stt_per_minute: sp?.stt_per_minute ?? llm.pricing.stt_per_minute,
    },
  };
}
