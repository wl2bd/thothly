export type JobStatus =
  | "pending"
  | "discovering"
  | "reviewing"
  | "processing"
  | "completed"
  | "failed";

export interface Source {
  url: string;
}

export interface DiscoveredItem {
  id: string;
  source_index: number;
  item_index: number;
  item_type: "youtube" | "blog";
  title: string;
  url: string;
  estimated_duration_s: number | null;
  estimated_size_chars: number | null;
  preview_html: string | null;
  selected: boolean;
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

export async function confirmJob(id: string, selectedIds: string[]): Promise<JobResponse> {
  const res = await fetch(`/api/jobs/${id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected_ids: selectedIds }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export function getDownloadUrl(id: string): string {
  return `/api/jobs/${id}/download`;
}
