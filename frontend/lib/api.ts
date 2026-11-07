import type { components } from "./api-schema";
import openapi from "./openapi.json";

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
export type LlmRole = Schemas["RoleInfo"];
export type LlmPricing = Schemas["Pricing"];
export type LlmProvider = Schemas["ProviderInfo"];
export type VisitorEndpoint = Schemas["VisitorEndpoint"];
export type SearchResult = Schemas["SearchResult"];
export type ResultType = SearchResult["type"];
export type ProviderBatch = Schemas["ProviderBatch"];

const limits = openapi.components.schemas;
// Most sources a compilation can hold, and the longest title.
export const MAX_SOURCES = limits.JobCreate.properties.sources.maxItems;
export const BOOK_TITLE_MAX = limits.JobCreate.properties.book_title.anyOf[0].maxLength!;

// Carries the HTTP status so callers can tell a terminal client error (e.g. a
// 404 for an unknown compilation) from a transient one (5xx, backend blip) and
// react differently — the live poller retries the latter but not the former.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
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
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sources, book_title: bookTitle || undefined }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function fetchJob(id: string): Promise<JobResponse> {
  const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function fetchLlmConfig(): Promise<LlmConfig> {
  const res = await fetch("/api/llm", { cache: "no-store" });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function confirmJob(
  id: string,
  selectedIds: string[],
  bookTitle?: string,
  llmRoles: string[] = [],
  visitor: { llm?: VisitorEndpoint; stt?: VisitorEndpoint } = {},
): Promise<JobResponse> {
  const res = await fetch(`/api/jobs/${id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The visitor's keys ride in the body, never a header or the URL.
    body: JSON.stringify({
      selected_ids: selectedIds,
      book_title: bookTitle,
      llm_roles: llmRoles,
      llm: visitor.llm,
      stt: visitor.stt,
    }),
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
  const res = await fetch("/api/llm/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, api_key: apiKey, base_url: baseUrl }),
  });
  if (!res.ok) return parseError(res);
  const data: { models: string[] } = await res.json();
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
