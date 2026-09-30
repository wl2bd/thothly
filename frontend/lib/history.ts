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
  // How many sources went in. Absent on entries stored before it was kept;
  // the next refresh fills it in.
  sources?: number;
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

// A count that isn't a whole number is dropped, not the book: it is a detail
// the next refresh restores.
function withValidSources(e: CompilationSnapshot): CompilationSnapshot {
  if (e.sources === undefined || (Number.isInteger(e.sources) && e.sources >= 0)) return e;
  return { id: e.id, title: e.title, createdAt: e.createdAt, status: e.status };
}

export function parseHistory(raw: string | null): CompilationSnapshot[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSnapshot).map(withValidSources);
  } catch {
    return [];
  }
}

// Still being found or waiting for you to pick what goes in, versus past
// review (compiling, done or stopped). Newest first in each.
const TO_REVIEW: readonly JobStatus[] = ["pending", "discovering", "reviewing"];

export function groupBooks(entries: CompilationSnapshot[]): {
  toReview: CompilationSnapshot[];
  ready: CompilationSnapshot[];
} {
  const time = (e: CompilationSnapshot) => {
    const t = new Date(e.createdAt).getTime();
    return Number.isNaN(t) ? -Infinity : t;
  };
  const sorted = [...entries].sort((a, b) => time(b) - time(a));
  return {
    toReview: sorted.filter((e) => TO_REVIEW.includes(e.status)),
    ready: sorted.filter((e) => !TO_REVIEW.includes(e.status)),
  };
}

export function readHistory(): CompilationSnapshot[] {
  // Server-rendered passes have no storage; callers render a skeleton until
  // mount rather than branching on this.
  if (typeof window === "undefined") return [];
  try {
    // This is the boundary where storage the user could have hand-edited, or an
    // older build could have written, meets code that treats the result as typed
    // (see parseHistory). A status literal this build predates drops its entry;
    // a schema change bumps KEY to .v2.
    return parseHistory(window.localStorage.getItem(KEY));
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
  job: Pick<JobResponse, "id" | "book_title" | "created_at" | "status" | "sources">,
): void {
  const entry: CompilationSnapshot = {
    id: job.id,
    title: job.book_title,
    createdAt: job.created_at,
    status: job.status,
    sources: job.sources.length,
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
