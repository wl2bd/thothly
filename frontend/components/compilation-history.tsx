"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { XIcon } from "lucide-react";

import { ApiError, fetchJob, type JobStatus } from "@/lib/api";
import {
  forgetCompilation,
  getHistorySnapshot,
  getHistoryServerSnapshot,
  replaceHistory,
  subscribeHistory,
  type CompilationSnapshot,
} from "@/lib/history";

// What a row says about a compilation that is not simply ready. `completed` is
// absent on purpose: a finished compilation needs no state, and labelling every
// row would turn the list into a status board instead of a way back in.
const STATUS_LABEL: Partial<Record<JobStatus, string>> = {
  pending: "Queued",
  discovering: "Finding sources",
  reviewing: "Waiting for you",
  processing: "Compiling",
  failed: "Did not finish",
};

// The compilations this browser remembers. It is the second half of /app's
// primary action: start a new compilation, or return to one you already made.
export function CompilationHistory({ hidden }: { hidden: boolean }) {
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

  // A query owns the column while it is running: results and history never
  // compete for the same space. Rendering null rather than unmounting keeps the
  // refresh from firing again every time the field is cleared.
  if (hidden) return null;

  // Storage has not been read yet. Nothing is drawn on purpose: the read is
  // synchronous and lands on the first client commit, so a skeleton here would
  // either flash for a single frame or, sized from a count the server cannot
  // know, break hydration.
  if (entries === null) return null;

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Nothing compiled yet</h2>
        <p className="text-muted-foreground text-sm leading-relaxed text-balance">
          Search above, or paste a link: a video, a podcast, an article, even a
          whole playlist or blog.
        </p>
        <Link
          href="/#how-it-works"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring w-fit rounded-sm text-sm underline underline-offset-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          See how it works
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        Your compilations
      </h2>
      <ul className="flex flex-col">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center gap-2 border-b last:border-b-0"
          >
            <Link
              href={`/jobs/${entry.id}`}
              className="focus-visible:ring-ring -mx-2 flex min-w-0 flex-1 flex-col gap-1 rounded-md px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              {/* Titles run to 100 characters, so the row truncates rather than
                  wrapping to three lines and breaking the list's rhythm. */}
              <span className="truncate text-sm">
                {entry.title ?? "Untitled compilation"}
              </span>
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <span>{relativeDate(entry.createdAt)}</span>
                {STATUS_LABEL[entry.status] && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{STATUS_LABEL[entry.status]}</span>
                  </>
                )}
              </span>
            </Link>
            {/* Browser-local and cheap to redo, so it forgets on the press with
                no confirmation. The hit area is widened past the glyph to clear
                24 CSS pixels, the same reason the job screen's drag handle is
                built this way. */}
            <button
              type="button"
              onClick={() => forgetCompilation(entry.id)}
              aria-label="Forget this compilation"
              className="text-muted-foreground/60 hover:text-foreground focus-visible:ring-ring inline-grid h-10 w-6 shrink-0 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <XIcon className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {stale && (
        <p className="text-muted-foreground text-xs">
          This list may be out of date.
        </p>
      )}
    </div>
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
