import type { components } from "./api-schema";
import openapi from "./openapi.json" with { type: "json" };

// The backend's shapes, generated from its OpenAPI schema (lib/openapi.json,
// written by backend/scripts/export_openapi.py; `pnpm api:types` regenerates
// lib/api-schema.d.ts from it).
type Schemas = components["schemas"];

export type JobResponse = Schemas["JobResponse"];
export type JobStatus = JobResponse["status"];
export type Source = Schemas["Source"];
export type SourceSpec = Schemas["SourceSpec"];
export type DiscoveredItem = Schemas["DiscoveredItemResponse"];
export type ItemType = DiscoveredItem["item_type"];
export type CompileState = NonNullable<DiscoveredItem["compile_state"]>;
export type ItemPreview = Schemas["ItemPreview"];
export type LlmConfig = Schemas["LLMConfig"];
export type RoleId = Schemas["RoleInfo"]["id"];
export type VisitorEndpoint = Schemas["VisitorEndpoint"];
export type SearchResult = Schemas["SearchResult"];
export type ResultType = SearchResult["type"];
export type ProviderBatch = Schemas["ProviderBatch"];
export type CoverSettings = Schemas["CoverSettings"];
export type CoverTint = NonNullable<CoverSettings["tint"]>;
export type CoverEmblem = NonNullable<CoverSettings["emblem"]>;

const limits = openapi.components.schemas;
// Most sources a compilation can hold, and the longest title.
export const MAX_SOURCES = limits.JobCreate.properties.sources.maxItems;
export const BOOK_TITLE_MAX = limits.JobCreate.properties.book_title.anyOf[0].maxLength!;

// Carries the HTTP status so callers can tell a terminal client error (e.g. a
// 404 for an unknown compilation) from a transient one (5xx, backend blip) and
// react differently — the live poller retries the latter but not the former.
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseError(res: Response): Promise<never> {
  const data = await res.json().catch(() => ({ detail: `The request failed (${res.status}).` }));
  throw new ApiError(data.detail ?? `The request failed (${res.status}).`, res.status);
}

export async function createJob(
  sources: SourceSpec[],
  bookTitle?: string,
): Promise<JobResponse> {
  const body: Schemas["JobCreate"] = { sources, book_title: bookTitle || undefined };
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function fetchJob(id: string): Promise<JobResponse> {
  const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
  if (!res.ok) return parseError(res);
  return res.json();
}

// The config when none could be read: no model, no transcription, nothing priced.
export const NO_MODELS: LlmConfig = {
  available: false,
  stt_available: false,
  podcast_transcripts: false,
  roles: [],
  pricing: { stt_per_minute: 0, llm_per_mtok_in: 0, llm_per_mtok_out: 0 },
  providers: [],
  custom_base_url_allowed: false,
};

export async function fetchLlmConfig(): Promise<LlmConfig> {
  const res = await fetch("/api/llm", { cache: "no-store" });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function confirmJob(
  id: string,
  selectedIds: string[],
  bookTitle: string | undefined,
  llmRoles: string[],
  visitor: { llm?: VisitorEndpoint; stt?: VisitorEndpoint },
  cover?: CoverSettings,
): Promise<JobResponse> {
  const body: Schemas["JobConfirm"] = {
    selected_ids: selectedIds,
    book_title: bookTitle,
    llm_roles: llmRoles,
    llm: visitor.llm,
    stt: visitor.stt,
    cover,
  };
  const res = await fetch(`/api/jobs/${id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The visitor's keys ride in the body, never a header or the URL.
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

// Stops a running compile before its next item or AI call; the book keeps the
// chapters already built.
export async function stopJob(id: string): Promise<JobResponse> {
  const res = await fetch(`/api/jobs/${id}/stop`, { method: "POST" });
  if (!res.ok) return parseError(res);
  return res.json();
}

// Checks a key with its provider (through the backend: providers refuse
// browser calls) and returns the models it grants.
export async function verifyKey(
  provider: string,
  apiKey: string,
  baseUrl?: string,
): Promise<string[]> {
  const body: Schemas["VerifyRequest"] = { provider, api_key: apiKey, base_url: baseUrl };
  const res = await fetch("/api/llm/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseError(res);
  const data: Schemas["VerifyResponse"] = await res.json();
  return data.models;
}

export async function fetchItemPreview(
  jobId: string,
  itemId: string,
): Promise<ItemPreview> {
  const res = await fetch(`/api/jobs/${jobId}/items/${itemId}/preview`, {
    cache: "no-store",
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

// Reads one video in another of its caption languages (a code from its
// `transcript_tracks`); answers with the updated item.
export async function chooseItemLanguage(
  jobId: string,
  itemId: string,
  language: string,
): Promise<DiscoveredItem> {
  const body: Schemas["ItemLanguage"] = { language };
  const res = await fetch(`/api/jobs/${jobId}/items/${itemId}/language`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

// The cover as it would be drawn now, as a JPEG blob for the review thumbnail.
export async function fetchCoverPreview(
  jobId: string,
  body: Schemas["CoverPreview"],
  signal?: AbortSignal,
): Promise<Blob> {
  const res = await fetch(`/api/jobs/${jobId}/cover/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) return parseError(res);
  return res.blob();
}

// The visitor's own cover image, sent as the raw body (already scaled down in
// the browser, so it stays far under the proxy's body limit).
export async function uploadCoverImage(jobId: string, image: Blob): Promise<JobResponse> {
  const res = await fetch(`/api/jobs/${jobId}/cover/image`, {
    method: "POST",
    headers: { "Content-Type": image.type || "image/jpeg" },
    body: image,
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function removeCoverImage(jobId: string): Promise<JobResponse> {
  const res = await fetch(`/api/jobs/${jobId}/cover/image`, { method: "DELETE" });
  if (!res.ok) return parseError(res);
  return res.json();
}

export function getDownloadUrl(id: string, format: "epub" | "md" = "epub"): string {
  return `/api/jobs/${id}/download?format=${format}`;
}

/**
 * Multi-provider search, streamed: `onBatch` fires once per provider, the
 * moment it answers, so fast sources (podcasts) show up without waiting for
 * the slow ones (YouTube, the web). Resolves when every provider has answered.
 */
export async function searchStream(
  query: string,
  onBatch: (batch: ProviderBatch) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/search/stream?q=${encodeURIComponent(query)}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok || !res.body) return parseError(res);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += value;
      // Each complete line is one batch; a partial last line waits for the rest.
      const lines = buffer.split("\n");
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (line.trim()) onBatch(JSON.parse(line) as ProviderBatch);
      }
      if (done) return;
    }
  } finally {
    // Close the connection if parsing threw mid-stream; a no-op once done.
    reader.cancel().catch(() => {});
  }
}
