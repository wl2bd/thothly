import { useState } from "react";
import { Check, Minus, X } from "lucide-react";
import { isFinished, isLeftOutState, itemTitle } from "@/lib/review";
import { sourceName } from "@/lib/url";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Progress } from "@/components/ui/progress";
import { cn, plural } from "@/lib/utils";
import { stopJob, type CompileState, type DiscoveredItem, type JobResponse, type Source } from "@/lib/api";

// The head of both waits. No spinner: the one thing in motion is the row being
// worked on (its title shimmers); the bar only moves when a step lands, so it
// says exactly how far along it is rather than that something is spinning.
function WaitHeader({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <Progress value={total ? (done / total) * 100 : 0} aria-label={label} className="gap-2.5">
      <span className="flex w-full items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {done} of {total}
        </span>
      </span>
    </Progress>
  );
}


// The wait between staging sources and reviewing items. It lists the sources by
// the names the user just picked (the staged title shows immediately; the
// discovered name replaces it once known), and shows each one's live state as
// discovery resolves them one by one: done with an item tally, the current one
// scanning, the rest waiting.
export function DiscoveringView({ sources }: { sources: Source[] }) {
  // Discovery runs sequentially, so the first not-yet-resolved source is the one
  // currently being looked through; the rest are still queued.
  const activeIndex = sources.findIndex((s) => !s.resolved);
  return (
    <div className="flex flex-col gap-5">
      <WaitHeader
        label="Opening your sources"
        done={sources.filter((s) => s.resolved).length}
        total={sources.length}
      />
      <ul className="flex flex-col divide-y">
        {sources.map((s, i) => {
          const label = sourceName(s);
          const isActive = i === activeIndex;
          const count = s.item_count ?? 0;
          return (
            <li
              key={`${s.url}-${i}`}
              className="flex items-center gap-3 py-3.5 text-sm"
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {s.resolved && s.error ? (
                  <X className="text-muted-foreground size-3.5" />
                ) : s.resolved ? (
                  <Check className="text-muted-foreground size-3.5" />
                ) : null}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  s.resolved ? "text-foreground" : "text-muted-foreground",
                  isActive && "text-shimmer",
                  !s.resolved && !isActive && "opacity-50",
                )}
              >
                {label}
              </span>
              {s.resolved && s.error ? (
                <span className="text-muted-foreground shrink-0">
                  {s.error}
                </span>
              ) : s.resolved ? (
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {plural(count, "item")}
                </span>
              ) : isActive ? (
                <span className="text-muted-foreground shrink-0">Opening</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// The wait between "Compile" and the finished compilation. It walks the items
// the user confirmed, in the order they compile, and shows each one's outcome as
// the runner reaches it (built, or left out with the reason why), then one last
// step for assembling the file. Same shape as DiscoveringView, so the two waits
// read as one progression.
export function CompilingView({ items }: { items: DiscoveredItem[] }) {
  // The runner writes each transition as it goes, so "every item is terminal" is
  // exactly "the last chapter is built", which is when the only remaining work
  // (assembling the book and rendering the file) starts. Deduced rather than
  // stored: a DB field would only flip a poll later. The `some(... "done")`
  // guard keeps an all-skipped or all-failed run from lighting up "Building the
  // file" for one poll before the failure screen replaces it: run_compilation
  // never calls compile_book when nothing survived.
  const building =
    items.length > 0 &&
    items.some((it) => it.compile_state === "done") &&
    items.every((it) => isFinished(it.compile_state));
  return (
    <div className="flex flex-col gap-5">
      <WaitHeader
        label={building ? "Building the file" : "Writing your chapters"}
        done={items.filter((it) => isFinished(it.compile_state)).length}
        total={items.length}
      />
      <ul className="flex flex-col divide-y">
        {items.map((it) => (
          <CompileStep
            key={it.id}
            state={it.compile_state ?? "pending"}
            label={itemTitle(it)}
            note={it.compile_note}
          />
        ))}
        {/* The one step that isn't an item: turning the finished chapters into
            the file you take away. It happens last, so it sits last. */}
        <CompileStep
          state={building ? "compiling" : "pending"}
          label="Building the file"
        />
      </ul>
    </div>
  );
}

// One row of the compile list: a state glyph, the item's name, and, when it
// didn't make it, the reason on its own line under the name. Neither outcome
// (left out, failed) is dramatised: the glyph and the reason state what
// happened and nothing more.
function CompileStep({
  state,
  label,
  note,
}: {
  state: CompileState;
  label: string;
  note?: string | null;
}) {
  const done = state === "done";
  const active = state === "compiling";
  const out = isLeftOutState(state);
  return (
    <li className="flex items-start gap-3 py-3.5 text-sm">
      <span className="flex size-3.5 shrink-0 items-center justify-center pt-0.5">
        {done ? (
          <Check className="text-muted-foreground size-3.5" />
        ) : state === "failed" ? (
          <X className="text-destructive size-3.5" />
        ) : state === "skipped" ? (
          <Minus className="text-muted-foreground size-3.5" />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate",
            done ? "text-foreground" : "text-muted-foreground",
            active && "text-shimmer",
            state === "pending" && "opacity-50",
          )}
        >
          {label}
        </span>
        {out && note && (
          <span className="text-muted-foreground">{note}</span>
        )}
      </span>
      {/* While an item is running, its note carries the stage it's in: a long
          transcript through the AI passes can hold the row for minutes, and a
          bare "building…" there reads as a hang. */}
      {active && (
        <span className="text-muted-foreground shrink-0">{note || "Writing"}</span>
      )}
    </li>
  );
}

// The terminal counterpart to CompilingView: a compile can fail with every
// item's outcome already written, and those reasons are what the user was
// watching land seconds ago, so the same CompileStep list comes to rest here.
// No "Building the file" row: nothing was built. The list is only shown when
// there are items (a job that failed during discovery has none; job.error
// alone covers that case).
export function FailedView({ job }: { job: JobResponse }) {
  return (
    <div className="flex flex-col gap-2">
      <Notice variant="error">
        <span className="block font-medium">Compilation failed.</span>
        {job.error}
      </Notice>
      {job.discovered_items.length > 0 && (
        <ul className="flex flex-col divide-y">
          {job.discovered_items.map((it) => (
            <CompileStep
              key={it.id}
              state={it.compile_state ?? "pending"}
              label={itemTitle(it)}
              note={it.compile_note}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// The way out of a long compile. It cuts in before the next AI call, so the
// item in progress stops paying too, and keeps the chapters already built.
export function StopButton({ jobId, built }: { jobId: string; built: number }) {
  const [stopping, setStopping] = useState(false);
  const [failed, setFailed] = useState(false);
  const stop = async () => {
    setStopping(true);
    setFailed(false);
    try {
      await stopJob(jobId);
    } catch {
      setStopping(false);
      setFailed(true);
    }
  };
  const label = stopping
    ? "Stopping…"
    : built > 0
      ? `Stop and keep ${plural(built, "chapter")}`
      : "Stop";
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" onClick={stop} disabled={stopping} className="w-full">
        {label}
      </Button>
      {failed && <p className="text-destructive text-sm">Couldn’t stop it. Try again.</p>}
    </div>
  );
}
