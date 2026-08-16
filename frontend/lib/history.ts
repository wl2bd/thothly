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

// Every JobStatus the backend can send. Kept as a runtime list because the
// type alone cannot guard storage: this is the boundary where data the user
// (or a stale build) could have written meets code that trusts it.
const STATUSES: readonly JobStatus[] = [
  "pending",
  "discovering",
  "reviewing",
  "processing",
  "completed",
  "failed",
];

function isSnapshot(value: unknown): value is CompilationSnapshot {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    (typeof e.title === "string" || e.title === null) &&
    typeof e.createdAt === "string" &&
    STATUSES.includes(e.status as JobStatus)
  );
}

export function readHistory(): CompilationSnapshot[] {
  // Server-rendered passes have no storage; callers render a skeleton until
  // mount rather than branching on this.
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // This is the boundary where storage the user could have hand-edited, or an
    // older build could have written, meets code that treats the result as typed.
    // Every field must be validated: id string, title string or null, createdAt
    // string, status one of the known literals. A predicate that asserts the whole
    // shape while checking one field is worse than no predicate, because consumers
    // stop defending themselves. If the backend ever adds a new status literal,
    // entries carrying it would be dropped by a build that predates it — that is
    // accepted, and it is what the versioned key exists to handle: a schema change
    // bumps KEY to .v2.
    return parsed.filter(isSnapshot);
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
  // Storage events only reach OTHER tabs, so this tab has to announce its own
  // writes or the list it just changed would not move.
  invalidate();
}

// ── the store ────────────────────────────────────────────────────────────────
//
// Storage is external state, and React reads it through useSyncExternalStore
// rather than an effect: that is what keeps the server markup (no storage, so
// no list) and the first client markup identical without a mount-time setState.
// The snapshot has to be cached, because getSnapshot is called on every render
// and a fresh array each time would never compare equal and would re-render
// forever.

let snapshot: CompilationSnapshot[] | null = null;
const listeners = new Set<() => void>();

function invalidate(): void {
  snapshot = null;
  for (const listener of listeners) listener();
}

export function subscribeHistory(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab compiling something, or forgetting it, must not leave this one
  // showing a list that no longer exists.
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function onStorage(event: StorageEvent): void {
  if (event.key === null || event.key === KEY) invalidate();
}

export function getHistorySnapshot(): CompilationSnapshot[] | null {
  if (snapshot === null) snapshot = readHistory();
  return snapshot;
}

// `null` is the "not read yet" phase, and the server is permanently in it.
export function getHistoryServerSnapshot(): CompilationSnapshot[] | null {
  return null;
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

// Overwrite the whole list in one go, order included. The background refresh
// needs this: it corrects every title and status at once and drops the ids the
// server no longer has, and doing that through `recordCompilation` would move
// each refreshed entry to the front and invert the list on every load.
export function replaceHistory(entries: CompilationSnapshot[]): void {
  write(entries);
}
