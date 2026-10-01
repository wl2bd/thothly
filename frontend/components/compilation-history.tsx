"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { ApiError, fetchJob, type JobStatus } from "@/lib/api";
import {
  forgetCompilation,
  getHistorySnapshot,
  groupBooks,
  getHistoryServerSnapshot,
  replaceHistory,
  subscribeHistory,
  type CompilationSnapshot,
} from "@/lib/history";

// The group label says "To review" or "Ready"; a row only adds the states the
// label doesn't cover: still being built, or stopped.
const STATUS_LABEL: Partial<Record<JobStatus, string>> = {
  pending: "Building…",
  discovering: "Building…",
  processing: "Building…",
  failed: "Did not finish",
};

// A deleted row goes at once; storage forgets it only when the Undo toast
// runs out, so a slip costs nothing.
const UNDO_MS = 5000;

// The compilations this browser remembers, shown in the compilation pane while
// nothing is staged: start a new compilation, or return to one you made.
export function CompilationHistory() {
  // `null` is the phase before storage has been read, which the server is
  // permanently in. Subscribing to the store rather than copying it into state
  // means a write anywhere — this component, a job page, another tab — lands
  // here without anyone wiring it up.
  const entries = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistoryServerSnapshot,
  );
  // The refresh could not reach the server, so what is on screen is whatever the
  // browser last stored. Said once, quietly, rather than per row.
  const [stale, setStale] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  function remove(entry: CompilationSnapshot) {
    setHidden((prev) => new Set(prev).add(entry.id));
    let undone = false;
    const commit = () => {
      if (!undone) forgetCompilation(entry.id);
    };
    toast("Compilation deleted", {
      description: entry.title ?? undefined,
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          undone = true;
          setHidden((prev) => {
            const next = new Set(prev);
            next.delete(entry.id);
            return next;
          });
        },
      },
      onAutoClose: commit,
      onDismiss: commit,
    });
  }

  useEffect(() => {
    const stored = getHistorySnapshot();
    if (!stored || stored.length === 0) return;

    let cancelled = false;
    // Correct the snapshots against the server, one request per entry, all at
    // once. `allSettled` rather than `all`: one dead id must not cost the whole
    // refresh. The rows are already on screen while this runs, which is the
    // point of storing snapshots at all.
    void (async () => {
      const settled = await Promise.allSettled(stored.map((e) => fetchJob(e.id)));
      if (cancelled) return;

      let unreachable = false;
      const next: CompilationSnapshot[] = [];
      settled.forEach((result, i) => {
        const entry = stored[i];
        if (result.status === "fulfilled") {
          next.push({
            id: entry.id,
            title: result.value.book_title,
            createdAt: result.value.created_at,
            status: result.value.status,
            sources: result.value.sources.length,
          });
          return;
        }
        // A 404 is the server saying it genuinely no longer has this job, so the
        // entry goes. Anything else — the backend cold-starting, offline, a
        // proxy 502 — says nothing about the job, and pruning on it would delete
        // someone's whole list the one time their network hiccuped.
        if (result.reason instanceof ApiError && result.reason.status === 404) return;
        unreachable = true;
        next.push(entry);
      });

      setStale(unreachable);
      // The rows come from the store, so correcting storage IS correcting the
      // list. Nothing else has to be told.
      replaceHistory(next);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Storage has not been read yet, which is the whole server pass and every
  // frame until hydration. Measured on the deployed demo, that is about two
  // seconds on a phone, not the single frame it takes locally.
  //
  // Nothing is drawn there anyway, and the reason is not cost. The server
  // cannot know how many snapshots this browser holds, so any skeleton it
  // renders is a guess shown to everyone — and most people arriving at a demo
  // have no history at all, so the guess would be a fake list that collapses
  // into "Nothing compiled yet" a second later. A quiet gap beats inventing
  // rows. It costs no layout shift either: the list has the pane to itself, so
  // arriving late moves nothing the reader is already using.
  if (entries === null) return null;

  const visible = entries.filter((e) => !hidden.has(e.id));

  if (visible.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-medium">Nothing compiled yet</h3>
        <p className="text-muted-foreground text-sm leading-relaxed text-balance">
          Your sources land here, ready to review.
        </p>
        <Link
          href="/about#how-it-works"
          className="text-muted-foreground hover:text-foreground text-link w-fit text-sm"
        >
          See how it works
        </Link>
      </div>
    );
  }

  const { toReview, ready } = groupBooks(visible);

  return (
    <div className="flex flex-col gap-6">
      {/* A section of the pane, under its title: a step below it, a step
          above the To review and Ready labels. */}
      <h3 className="text-base font-medium">Your compilations</h3>
      {[
        { label: "To review", books: toReview },
        { label: "Ready", books: ready },
      ].map(
        ({ label, books }) =>
          books.length > 0 && (
            <section key={label} aria-label={label} className="flex flex-col gap-1">
              <h4 className="eyebrow">{label}</h4>
              <ul className="flex flex-col">
                {books.map((entry) => (
                  <BookRow key={entry.id} entry={entry} onDelete={() => remove(entry)} />
                ))}
              </ul>
            </section>
          ),
      )}
      {stale && (
        <p className="text-muted-foreground text-xs">
          This list may be out of date.
        </p>
      )}
    </div>
  );
}

function BookRow({ entry, onDelete }: { entry: CompilationSnapshot; onDelete: () => void }) {
  // "3 sources · 3 hours ago". No format: every book comes out as both EPUB and
  // Markdown, so it would read the same on every row.
  const meta = [
    entry.sources !== undefined && `${entry.sources} ${entry.sources === 1 ? "source" : "sources"}`,
    STATUS_LABEL[entry.status],
    relativeDate(entry.createdAt),
  ].filter(Boolean);
  return (
    <li className="group flex items-center gap-2 border-b last:border-b-0">
      <Link
        href={`/jobs/${entry.id}`}
        className="hover:bg-muted focus-visible:ring-ring -mx-2 flex min-w-0 flex-1 flex-col gap-1 rounded-md px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        {/* Titles run to 100 characters, so the row truncates rather than
            wrapping to three lines and breaking the list's rhythm. */}
        <span className="truncate text-sm">
          {entry.title ?? "Untitled compilation"}
        </span>
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          {meta.map((m, i) => (
            <span key={i} className="contents">
              {i > 0 && <span aria-hidden="true">·</span>}
              <span>{m}</span>
            </span>
          ))}
        </span>
      </Link>
      {/* A bin, not a cross: this deletes (undoable for a few seconds). Shown
          on hover or keyboard focus where there is a pointer to hover with;
          always there on touch, where nothing hovers. */}
      <Button
        type="button"
        variant="nav"
        size="icon-sm"
        onClick={onDelete}
        aria-label="Delete this compilation"
        className="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
      >
        <Trash2Icon />
      </Button>
    </li>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

// Largest unit first would read "0 years ago" for anything recent, so the scale
// is climbed from seconds up and the first unit the delta fits in wins.
const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

function relativeDate(iso: string): string {
  const at = new Date(iso).getTime();
  // Storage is user-editable, so an unparseable date is possible. The row is
  // still worth showing; only its date is not.
  if (Number.isNaN(at)) return "";
  let delta = (at - Date.now()) / 1000;
  for (const { amount, unit } of DIVISIONS) {
    if (Math.abs(delta) < amount) return RELATIVE.format(Math.round(delta), unit);
    delta /= amount;
  }
  return "";
}
