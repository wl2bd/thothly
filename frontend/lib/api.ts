export type JobStatus =
  | "pending"
  | "discovering"
  | "reviewing"
  | "processing"
  | "completed"
  | "failed";

export interface Source {
  url: string;
  // Optional hints the backend uses only for podcast episodes (whose audio URL
  // isn't self-identifying and carries no title); omitted for pasted links.
  kind?: string;
  title?: string;
  // Episode length (seconds) from the search result — the only place it's known,
  // and what the review screen needs for the transcription cost estimate.
  duration_s?: number;
}

export interface DiscoveredItem {
  id: string;
  source_index: number;
  item_index: number;
  item_type: "youtube" | "blog" | "podcast";
  title: string;
  url: string;
  estimated_duration_s: number | null;
  estimated_size_chars: number | null;
  preview_html: string | null;
  selected: boolean;
  // YouTube transcript info computed at discovery. has_transcript is tri-state:
  // true = usable subtitles, false = none (skipped), null = unknown.
  has_transcript: boolean | null;
  transcript_lang: string | null;
  is_punctuated: boolean | null;
  word_count: number | null;
  reading_time_min: number | null;
}

export interface JobResponse {
  id: string;
  status: JobStatus;
  sources: Source[];
  created_at: string;
  updated_at: string;
  book_title: string | null;
  output_path: string | null;
  error: string | null;
  discovered_items: DiscoveredItem[];
}

export interface LlmRole {
  id: string;
  label: string;
  description: string;
  scope: "item" | "book";
}

export interface LlmPricing {
  stt_per_minute: number;
  llm_per_mtok_in: number;
  llm_per_mtok_out: number;
}

export interface LlmConfig {
  available: boolean;
  stt_available: boolean;
  roles: LlmRole[];
  pricing: LlmPricing;
}

export type ResultType =
  | "video"
  | "playlist"
  | "channel"
  | "podcast"
  | "episode"
  | "web";

export interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  url: string;
  thumbnail: string | null;
  duration_s: number | null;
  author: string | null;
  source: string;
  meta: Record<string, unknown>;
}

export interface ProviderError {
  provider: string;
  message: string;
}

export interface SearchResponse {
  results: SearchResult[];
  errors: ProviderError[];
}

async function parseError(res: Response): Promise<never> {
  const data = await res.json().catch(() => ({ detail: `Request failed: ${res.status}` }));
  throw new Error(data.detail ?? `Request failed: ${res.status}`);
}

export async function createJob(sources: Source[]): Promise<JobResponse> {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sources }),
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
): Promise<JobResponse> {
  const res = await fetch(`/api/jobs/${id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      selected_ids: selectedIds,
      book_title: bookTitle,
      llm_roles: llmRoles,
    }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export function getDownloadUrl(id: string): string {
  return `/api/jobs/${id}/download`;
}

export async function search(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) return parseError(res);
  return res.json();
}
