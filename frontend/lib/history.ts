import type { JobResponse, JobStatus } from "@/lib/api";

// What the browser remembers about a compilation you made. Deliberately a
// SNAPSHOT rather than a bare id: the public backend cold-starts in about 43
// seconds, and a list that needs the network to render leaves the app blank for
// that long. With the title and status stored, the list paints immediately and
// the network only corrects it.
export interface CompilationSnapshot {
  id: string;
  title: string | null;
  createdAt: string;
  status: JobStatus;
}

// Versioned so a later schema change degrades to an empty list instead of
// throwing on data this build can't read.
const KEY = "thothly.compilations.v1";

// Enough to cover the compilations anyone actually returns to, and a hard bound
// on both storage and the refresh burst the app fires on mount.
export const HISTORY_CAP = 25;

export function readHistory(): CompilationSnapshot[] {
  // Server-rendered passes have no storage; callers render a skeleton until
  // mount rather than branching on this.
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter rather than trust: a half-written or hand-edited entry should cost
    // that entry, not the whole list.
    return parsed.filter(
      (e): e is CompilationSnapshot =>
        !!e && typeof e === "object" && typeof (e as CompilationSnapshot).id === "string",
    );
  } catch {
    // Storage can throw outright (Safari private mode, a disabled setting).
    // History is a convenience; losing it must never break the page.
    return [];
  }
}

function write(entries: CompilationSnapshot[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, HISTORY_CAP)));
  } catch {
    /* quota or disabled storage; the app works without the list */
  }
}

// Upsert, newest first. Called when a compilation is created AND whenever a job
// screen loads, so a link someone shared with you joins your history the way a
// browser would treat a page you visited.
export function recordCompilation(
  job: Pick<JobResponse, "id" | "book_title" | "created_at" | "status">,
): void {
  const entry: CompilationSnapshot = {
    id: job.id,
    title: job.book_title,
    createdAt: job.created_at,
    status: job.status,
  };
  write([entry, ...readHistory().filter((e) => e.id !== job.id)]);
}

export function forgetCompilation(id: string): void {
  write(readHistory().filter((e) => e.id !== id));
}
