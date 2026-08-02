"use client";

import {
  Fragment,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  ViewTransition,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Check,
  Coins,
  Copy,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  Info,
  Minus,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { highlightMatch } from "@/components/highlight";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Logomark, Logotype } from "@/components/brand";
import { EpubTablet, MarkdownTablet } from "@/components/output-tablet";
import {
  MetaSep,
  SourceFavicon,
  SourceTypePill,
  hostOf,
  kindFromItemType,
} from "@/components/source-kind";
import { cn } from "@/lib/utils";
import { useScrollFade } from "@/lib/use-scroll-fade";
import {
  ApiError,
  confirmJob,
  fetchItemPreview,
  fetchJob,
  fetchLlmConfig,
  getDownloadUrl,
  type CompileState,
  type DiscoveredItem,
  type ItemPreview,
  type JobResponse,
  type LlmConfig,
  type Source,
} from "@/lib/api";

const ACTIVE_STATUSES = ["pending", "discovering", "processing"];

// Live-polling cadence and resilience. A single failed poll must not kill the
// live view: the job is still running server-side, so a transient failure (5xx,
// a network blip) is retried with exponential backoff (2s, 4s, 8s, capped) up
// to MAX_POLL_FAILURES before an error is shown. A 4xx (e.g. an unknown
// compilation) is terminal and surfaced at once.
const BASE_POLL_MS = 2000;
const MAX_POLL_MS = 15000;
const MAX_POLL_FAILURES = 5;

// The book title is required to generate and capped so it stays a title (it
// lands in EPUB metadata, the cover and the filename).
const BOOK_TITLE_MAX = 100;

// The editable default offered for a new compilation, so the title field is
// never blank on arrival, and tracks the live selection while still auto: a lone
// SELECTED source lends its own name (podcast / channel / blog, from discovery);
// several fall back to the generic "N sources" phrasing. Returns null when
// nothing is selected (nothing to name). Capped to the field limit.
function autoTitleForSelection(
  job: JobResponse,
  selected: Set<string>,
): string | null {
  const selectedSourceIndices = [
    ...new Set(
      job.discovered_items
        .filter((it) => selected.has(it.id))
        .map((it) => it.source_index),
    ),
  ];
  if (selectedSourceIndices.length === 0) return null;
  if (selectedSourceIndices.length === 1) {
    const src = job.sources[selectedSourceIndices[0]];
    const name = src?.name?.trim() || src?.title?.trim();
    if (name) return name.slice(0, BOOK_TITLE_MAX);
  }
  const n = selectedSourceIndices.length;
  return `Compilation of ${n} source${n === 1 ? "" : "s"}`.slice(
    0,
    BOOK_TITLE_MAX,
  );
}

export default function JobPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  // Whether `title` is still the auto value (vs user-typed). While auto it
  // tracks the selection; the first manual edit freezes it.
  const [titleIsAuto, setTitleIsAuto] = useState(true);
  // The selection the auto title was last computed for, so it can resync when
  // that changes (React's "adjust state during render", no effect).
  const [titleSyncedFor, setTitleSyncedFor] = useState<Set<string> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const [llm, setLlm] = useState<LlmConfig | null>(null);
  const [roles, setRoles] = useState<Set<string>>(new Set());
  // The compile order of the sources, drag-reorderable in review. Source indices
  // in display order; selected ids are flattened in this order on confirm.
  const [sourceOrder, setSourceOrder] = useState<number[]>([]);

  // Apply a fetched job, animating the card (flow-card ViewTransition) only when
  // the PHASE changes — discovering → reviewing → processing → completed — so
  // each phase cross-fades like the home card does, while the frequent in-phase
  // polls (per-source discovery progress) update instantly without flicker.
  const lastStatusRef = useRef<string | null>(null);
  const applyJob = useCallback((data: JobResponse) => {
    if (data.status !== lastStatusRef.current) {
      lastStatusRef.current = data.status;
      startTransition(() => setJob(data));
    } else {
      setJob(data);
    }
  }, []);

  useEffect(() => {
    fetchLlmConfig()
      .then(setLlm)
      .catch(() =>
        setLlm({
          available: false,
          stt_available: false,
          roles: [],
          pricing: { stt_per_minute: 0, llm_per_mtok_in: 0, llm_per_mtok_out: 0 },
        }),
      );
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    // A self-scheduling poll (setTimeout, not setInterval) so the delay can grow
    // after a failure instead of hammering a struggling backend every 2s.
    async function tick(): Promise<void> {
      let nextDelay: number | null;
      try {
        const data = await fetchJob(id);
        if (cancelled) return;
        applyJob(data);
        failures = 0;
        // Keep polling while the job is still working; stop once it settles.
        nextDelay = ACTIVE_STATUSES.includes(data.status) ? BASE_POLL_MS : null;
      } catch (err) {
        if (cancelled) return;
        // A 4xx (e.g. an unknown compilation) is terminal — show it and stop. A
        // 5xx or network blip is transient — retry with backoff so one hiccup
        // doesn't freeze a job that's still running server-side. Stay silent
        // during retries; only surface an error once we truly give up.
        const terminal =
          err instanceof ApiError && err.status >= 400 && err.status < 500;
        failures += 1;
        if (terminal || failures >= MAX_POLL_FAILURES) {
          setError(err instanceof Error ? err.message : String(err));
          nextDelay = null;
        } else {
          nextDelay = Math.min(BASE_POLL_MS * 2 ** (failures - 1), MAX_POLL_MS);
        }
      }
      if (!cancelled && nextDelay != null) {
        timer = setTimeout(tick, nextDelay);
      }
    }

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, pollKey, applyJob]);

  // When discovery completes, pre-select every item — the user unchecks what
  // they don't want rather than building the list from scratch. We adjust this
  // during render (tracking the previous status) rather than in an effect: it's
  // a one-shot reset on the transition into "reviewing", so React's recommended
  // "store info from previous renders" pattern fits and avoids a wasted pass.
  const [seenStatus, setSeenStatus] = useState<string | null>(null);
  if (job && job.status !== seenStatus) {
    setSeenStatus(job.status);
    if (job.status === "reviewing") {
      const allIds = new Set(job.discovered_items.map((it) => it.id));
      setSelected(allIds);
      // Editable default name (everything selected to start); it stays in sync
      // with the selection until the user edits it, and is required to generate.
      setTitle(autoTitleForSelection(job, allIds) ?? "");
      setTitleIsAuto(true);
      // Natural source order to start; review can drag it into another order.
      setSourceOrder(
        [...new Set(job.discovered_items.map((it) => it.source_index))].sort(
          (a, b) => a - b,
        ),
      );
    }
  }

  // Keep the auto title in step with the selection (React's "adjust state during
  // render" — same pattern as the seenStatus reset above, so no effect and no
  // cascading-render lint): deselecting a whole source drops the count, leaving
  // a single source swaps to its name. Frozen once the user edits the title.
  if (
    job &&
    job.status === "reviewing" &&
    titleIsAuto &&
    selected !== titleSyncedFor
  ) {
    setTitleSyncedFor(selected);
    const next = autoTitleForSelection(job, selected);
    if (next !== null) setTitle(next);
  }

  // A manual edit freezes the title (stops the selection from steering it).
  const onTitleChange = useCallback((value: string) => {
    setTitle(value);
    setTitleIsAuto(false);
  }, []);

  const toggle = useCallback((itemId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  // Bulk (de)select a set of ids at once — used by the per-source headers.
  const selectItems = useCallback((ids: string[], value: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const toggleRole = useCallback((roleId: string) => {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }, []);

  // Flip several roles at once — the AI polish master switch turns its whole
  // safe set on, or clears every opt-in pass off, in one move.
  const setRolesMany = useCallback((ids: string[], value: boolean) => {
    setRoles((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  async function onConfirm() {
    if (!job) return;
    setConfirming(true);
    setError(null);
    // Selected ids in the user's source order (then natural item order within a
    // source), so the backend persists and compiles them in exactly that order.
    const orderedIds = sourceOrder.flatMap((sourceIndex) =>
      job.discovered_items
        .filter((it) => it.source_index === sourceIndex && selected.has(it.id))
        .sort((a, b) => a.item_index - b.item_index)
        .map((it) => it.id),
    );
    try {
      const updated = await confirmJob(
        id,
        orderedIds,
        title.trim() || undefined,
        [...roles],
      );
      applyJob(updated);
      setPollKey((k) => k + 1); // resume polling for the compilation phase
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <main className="flex min-h-screen justify-center p-8 sm:p-12">
      <div className="flex w-full max-w-xl flex-col gap-10 py-12">
        <header className="flex items-baseline justify-between">
          {/* transitionTypes tags the return trip so the home hero (a far richer
              view than this one) can ease back in gently — see the to-home rules
              in globals.css — instead of snapping in at the forward speed. */}
          <Link
            href="/"
            transitionTypes={["to-home"]}
            className="flex items-center"
          >
            <Logotype className="h-8 w-auto" title="Thothly" />
          </Link>
          <Link
            href="/"
            transitionTypes={["to-home"]}
            className="text-muted-foreground text-sm hover:underline"
          >
            ← New compilation
          </Link>
        </header>

        {error && <Notice variant="error">{error}</Notice>}

        {/* Same view-transition identity as the home search card, so arriving
            here morphs that card into this one instead of a hard page cut. */}
        {(job || !error) && (
        <ViewTransition name="flow-card">
        <Card className="bg-surface-sunken">
          <CardContent>
          {!job ? (
            <StatusMessage label="Loading…" />
          ) : job.status === "pending" || job.status === "discovering" ? (
            <DiscoveringView sources={job.sources} />
          ) : job.status === "reviewing" ? (
            <ReviewList
              jobId={id}
              items={job.discovered_items}
              sources={job.sources}
              selected={selected}
              title={title}
              confirming={confirming}
              llm={llm}
              selectedRoles={roles}
              onToggleRole={toggleRole}
              onSetRolesMany={setRolesMany}
              onTitleChange={onTitleChange}
              onToggle={toggle}
              onSelectItems={selectItems}
              onSelectAll={() => setSelected(new Set(job.discovered_items.map((it) => it.id)))}
              onSelectNone={() => setSelected(new Set())}
              onConfirm={onConfirm}
              sourceOrder={sourceOrder}
              onReorderSources={setSourceOrder}
            />
          ) : job.status === "processing" ? (
            <CompilingView items={job.discovered_items} />
          ) : job.status === "completed" ? (
            <CompletedView jobId={id} job={job} />
          ) : (
            <FailedView job={job} />
          )}
          </CardContent>
        </Card>
        </ViewTransition>
        )}
      </div>
    </main>
  );
}

function StatusMessage({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-3 text-sm">
      <Spinner />
      {label}
    </div>
  );
}

// The wait between staging sources and reviewing items. It lists the sources by
// the names the user just picked (the staged title shows immediately; the
// discovered name replaces it once known), and shows each one's live state as
// discovery resolves them one by one — done with an item tally, the current one
// scanning, the rest waiting — so the moment reads as continuous progress
// toward review, not a dead spinner over raw URLs.
function DiscoveringView({ sources }: { sources: Source[] }) {
  // Discovery runs sequentially, so the first not-yet-resolved source is the one
  // currently being looked through; the rest are still queued.
  const activeIndex = sources.findIndex((s) => !s.resolved);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 text-sm font-medium">
        <Spinner />
        Looking through your {sources.length} source
        {sources.length !== 1 ? "s" : ""}…
      </div>
      <ul className="flex flex-col gap-1.5">
        {sources.map((s, i) => {
          const label = s.name?.trim() || s.title?.trim() || sourceLabel(s.url);
          const isActive = i === activeIndex;
          const count = s.item_count ?? 0;
          return (
            <li
              key={`${s.url}-${i}`}
              className="bg-muted/40 flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs"
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {s.resolved ? (
                  <Check className="text-foreground/60 size-3.5" />
                ) : isActive ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <span className="bg-muted-foreground/30 size-1.5 rounded-full" />
                )}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  s.resolved ? "text-foreground" : "text-muted-foreground",
                  !s.resolved && !isActive && "opacity-50",
                )}
              >
                {label}
              </span>
              {s.resolved ? (
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {count} item{count !== 1 ? "s" : ""}
                </span>
              ) : isActive ? (
                <span className="text-muted-foreground shrink-0">scanning…</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground text-xs">
        Listing what each one contains. You pick what goes in next.
      </p>
    </div>
  );
}

// The wait between "Generate" and the finished compilation. It walks the items
// the user confirmed, in the order they compile, and shows each one's outcome as
// the runner reaches it — built, or left out with the reason why — then one last
// step for assembling the file. Same shape as DiscoveringView above, so the two
// waits read as one continuous progression toward the payoff rather than two
// unrelated screens with a spinner in common.
function CompilingView({ items }: { items: DiscoveredItem[] }) {
  // The runner works the list in order and writes each transition as it goes, so
  // "every item is terminal" is exactly "the last chapter is built" — which is
  // when the only remaining work (assembling the book and rendering the file)
  // starts. Deduced rather than stored: it's true by construction, costs no extra
  // write, and a DB field would only flip a poll later, leaving a fully ticked
  // list sitting there doing nothing in between. The `some(... "done")` guard
  // keeps an all-skipped or all-failed run from lighting up "Building the file"
  // for one poll cycle before the failure screen replaces it: run_compilation
  // never calls compile_book when nothing survived, so there would be nothing
  // to actually build.
  const building =
    items.length > 0 &&
    items.some((it) => it.compile_state === "done") &&
    items.every((it) =>
      ["done", "skipped", "failed"].includes(it.compile_state ?? "pending"),
    );
  const built = items.filter((it) => it.compile_state === "done").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 text-sm font-medium">
        <Spinner />
        {building
          ? "Building your compilation…"
          : `Working through your ${items.length} item${items.length !== 1 ? "s" : ""}…`}
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((it) => (
          <CompileStep
            key={it.id}
            state={it.compile_state ?? "pending"}
            label={it.title}
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
      <p className="text-muted-foreground text-xs">
        {built} of {items.length} ready. This can take a few minutes.
      </p>
    </div>
  );
}

// One row of the compile list: a state glyph, the item's name, and — when it
// didn't make it — the reason, on its own line under the name. The glyphs extend
// the discovery list's vocabulary (check, spinner, waiting dot) with the two
// outcomes only a compile has: left out, and failed. Neither is dramatised; the
// glyph and the reason state what happened and nothing more.
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
  const out = state === "skipped" || state === "failed";
  return (
    <li className="bg-muted/40 flex items-start gap-2.5 rounded-lg px-3 py-2 text-xs">
      <span className="flex size-3.5 shrink-0 items-center justify-center pt-0.5">
        {done ? (
          <Check className="text-foreground/60 size-3.5" />
        ) : active ? (
          <Spinner className="size-3.5" />
        ) : state === "failed" ? (
          <X className="text-destructive size-3.5" />
        ) : state === "skipped" ? (
          <Minus className="text-muted-foreground size-3.5" />
        ) : (
          <span className="bg-muted-foreground/30 size-1.5 rounded-full" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate",
            done ? "text-foreground" : "text-muted-foreground",
            state === "pending" && "opacity-50",
          )}
        >
          {label}
        </span>
        {out && note && (
          <span className="text-muted-foreground/80">{note}</span>
        )}
      </span>
      {active && <span className="text-muted-foreground shrink-0">building…</span>}
    </li>
  );
}

// The terminal counterpart to CompilingView: a compile can now fail with every
// item's outcome already written (one crashed, the rest were skipped for lack
// of content, whatever the mix), and those reasons are exactly what the user
// was watching land seconds ago. Reusing CompileStep here — rather than a
// second, differently-worded list — makes the failure read as that same list
// coming to rest, not a different screen. No "Building the file" row: nothing
// was built. The list is only worth showing when there's something on it (a
// job that failed during discovery, before anything was confirmed, has no
// items to report); job.error alone still covers that case, as it always did.
function FailedView({ job }: { job: JobResponse }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-destructive text-sm font-medium">
        Compilation failed.
      </p>
      {job.error && (
        <p className="text-muted-foreground text-sm">{job.error}</p>
      )}
      {job.discovered_items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {job.discovered_items.map((it) => (
            <CompileStep
              key={it.id}
              state={it.compile_state ?? "pending"}
              label={it.title}
              note={it.compile_note}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// Which items count as "in the compilation": items that actually became
// chapters take precedence, so a source (or a preview built from it) whose
// every item was left out is never counted or named as if it made the book.
// Falls back to the raw selection (jobs from before per-item outcomes carry
// none) and then to the full item list. Shared by CompletedView's source count
// and its preview memo below, so the two never disagree about what "the
// compilation" contains.
function builtChapterItems(items: DiscoveredItem[]): DiscoveredItem[] {
  const selected = items.filter((it) => it.selected);
  const built = selected.filter((it) => it.compile_state === "done");
  return built.length ? built : selected.length ? selected : items;
}

// The payoff screen, framed as two destinations for the same compilation rather
// than one download with an afterthought: EPUB to read on an e-reader, Markdown
// to feed an AI. Each format reads as a deliberate way to take your work. The
// Markdown twin is fetched once so we can offer instant Copy and show its size
// (the AI's context budget is the thing the user weighs). We never gate by size:
// the right limit depends on the target LLM, so we inform rather than hide.
function CompletedView({ jobId, job }: { jobId: string; job: JobResponse }) {
  const [md, setMd] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const hasMarkdown = !!job.output_md_path;

  useEffect(() => {
    if (!hasMarkdown) return;
    let cancelled = false;
    fetch(getDownloadUrl(jobId, "md"))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("fetch failed"))))
      .then((t) => {
        if (!cancelled) setMd(t);
      })
      .catch(() => {
        /* leave Copy disabled; Download still works */
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, hasMarkdown]);

  const words = md ? countWords(md) : null;
  const tokens = words != null ? Math.round(words * TOKENS_PER_WORD) : null;

  // Sources actually represented in the compilation. Preference goes to the items
  // that became chapters: a source whose every item was left out isn't in the
  // book, and counting it would overstate what the user is holding. Falls back to
  // the selection (jobs from before per-item outcomes carry none) and then to the
  // staged source list.
  const counted = builtChapterItems(job.discovered_items);
  const sourceCount =
    new Set(counted.map((it) => it.source_index)).size || job.sources.length;

  // A real mini-preview of the compilation for the two slabs: the EPUB shows the
  // first chapter as a book page, the Markdown shows the actual top of the twin
  // (its "# Sources" index). Built from the fetched Markdown once it's in, with a
  // structure derived from the built items (the same preference `counted` above
  // uses) until then — so the placeholder title and the EPUB slab's fallback
  // never name a chapter that didn't make it into the book, and no faux stand-in
  // text ever flashes here either; this IS the thing that was just made.
  const preview = useMemo(() => {
    const chapters = builtChapterItems(job.discovered_items);
    const mdLines =
      md && md.trim()
        ? md.split("\n")
        : ["# Sources", "", ...chapters.map((it) => `- [${it.title}](${it.url})`)];
    // Prefer the first real chapter parsed from the Markdown (it's the EPUB's
    // actual opening page and is always present); fall back to the first built
    // item, then the book title, while the Markdown is still loading.
    const ch = md ? firstChapter(md) : null;
    return {
      mdLines,
      epubTitle:
        ch?.title ?? chapters[0]?.title ?? job.book_title ?? "Your compilation",
      epubBody: ch?.body ?? "",
    };
  }, [md, job]);

  // The payoff. Arriving on this screen (the job just finished, or a completed
  // job opened) plays a one-shot arrival: the gold seal — the thothly mark —
  // blooms in and flares, then the title and outputs cascade beneath it. It
  // plays once on mount (this view mounts only when the job is completed, a
  // terminal state); reduced motion renders the settled state instantly. The
  // rAF defers the flip one frame so the transition actually runs from the
  // hidden start rather than being painted already-shown.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const rise =
    "transition-[opacity,transform] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none";
  const riseIn = revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0";
  const at = (delay: number) => ({
    transitionDelay: revealed ? `${delay}ms` : "0ms",
  });

  async function copy() {
    if (!md) return;
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; Download remains the fallback */
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        {/* The seal — the thothly mark, in gold — lands first and its gold flares
            once (see .seal-bloom), the scribe's mark closing a finished work,
            before the title it heralds rises in beneath it. */}
        <span className="relative isolate mb-1 flex w-fit items-center">
          <span
            aria-hidden="true"
            className={cn(
              "bg-gold/50 dark:bg-gold/65 pointer-events-none absolute top-1/2 left-1/2 -z-10 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl",
              revealed ? "seal-bloom" : "opacity-0",
            )}
          />
          <span
            aria-hidden="true"
            className={cn(
              "text-gold flex origin-left transition-[opacity,transform] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
              revealed ? "scale-100 opacity-100" : "scale-75 opacity-0",
            )}
          >
            <Logomark className="h-8 w-auto" />
          </span>
        </span>

        {/* The book title is the artifact's name, so it's the hero here; the
            "ready" line steps back to an eyebrow above it. Falls back to the
            generic line as the title when no name was set. */}
        {job.book_title ? (
          <>
            <p
              className={cn("text-muted-foreground text-sm", rise, riseIn)}
              style={at(320)}
            >
              Your compilation is ready
            </p>
            <h1
              className={cn(
                "font-display text-3xl leading-[1.1] tracking-tight text-balance",
                rise,
                riseIn,
              )}
              style={at(520)}
            >
              {job.book_title}
            </h1>
          </>
        ) : (
          <h1
            className={cn(
              "font-display text-3xl leading-[1.1] tracking-tight text-balance",
              rise,
              riseIn,
            )}
            style={at(520)}
          >
            Your compilation is ready
          </h1>
        )}
        <p
          className={cn("text-muted-foreground text-xs", rise, riseIn)}
          style={at(760)}
        >
          {sourceCount} source{sourceCount !== 1 ? "s" : ""}
          {words != null && ` · ~${words.toLocaleString("en-US")} words`}
        </p>
        <LeftOutNotice
          items={job.discovered_items}
          className={cn(rise, riseIn)}
          style={at(880)}
        />
      </div>

      <div className={cn("grid gap-4", hasMarkdown && "sm:grid-cols-2")}>
        {/* EPUB — to read. The gold primary lives here: reading on an e-reader is
            the product's headline use, so its download is the one accented act.
            The stone tablet is the same one the landing's funnel showed, so what
            was promised is what's handed over. */}
        <div className={cn(rise, riseIn)} style={at(1000)}>
          <OutputTile
            tablet={
              <EpubTablet
                eyebrow="Chapter 1"
                title={preview.epubTitle}
                body={preview.epubBody}
              />
            }
            format="EPUB"
            destination="For your e-reader"
          >
            <a
              href={getDownloadUrl(jobId)}
              download
              className={cn(buttonVariants(), "w-full")}
            >
              <Download />
              Download
            </a>
          </OutputTile>
        </div>

        {/* Markdown — to feed an AI. Copy is the natural gesture there, so it
            leads; the token size rides the destination line (the AI's context
            budget is what the user weighs). Only shown when the twin exists. */}
        {hasMarkdown && (
          <div className={cn(rise, riseIn)} style={at(1200)}>
            <OutputTile
              tablet={<MarkdownTablet lines={preview.mdLines} />}
              format="Markdown"
              destination={
                tokens != null
                  ? `For an AI · ~${formatTokens(tokens)} tokens`
                  : "For an AI"
              }
            >
              <div className="flex w-full gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={copy}
                  disabled={!md}
                  className="flex-1"
                >
                  {copied ? (
                    <>
                      <Check />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy />
                      Copy
                    </>
                  )}
                </Button>
                <Tooltip content="Download Markdown">
                  <a
                    href={getDownloadUrl(jobId, "md")}
                    download
                    aria-label="Download Markdown"
                    className={buttonVariants({ variant: "outline", size: "icon" })}
                  >
                    <Download />
                  </a>
                </Tooltip>
              </div>
            </OutputTile>
          </div>
        )}
      </div>

      {tokens != null && tokens > 200000 && (
        <p
          className={cn("text-muted-foreground text-xs", rise, riseIn)}
          style={at(1400)}
        >
          This file is large for some AIs. Downloading and attaching it may work better.
        </p>
      )}
    </div>
  );
}

// What the user picked and didn't get. It sits above the downloads, not below:
// this is context for what they're about to take away, not a footnote after
// they've taken it. Absent entirely when everything made it, so it never turns
// a clean run into a screen with a warning on it. The arrival-cascade props
// (`className`/`style`, from CompletedView's `rise`/`riseIn`/`at`) are applied
// to a wrapper INSIDE this component, on the same branch as the early return,
// rather than by the caller wrapping a div around it: the header it lives in is
// a flex column with a `gap`, so an outer wrapper would still occupy a flex slot
// and leave a gap-sized blank space on a clean run even with nothing inside it.
function LeftOutNotice({
  items,
  className,
  style,
}: {
  items: DiscoveredItem[];
  className?: string;
  style?: CSSProperties;
}) {
  const leftOut = items.filter(
    (it) => it.compile_state === "skipped" || it.compile_state === "failed",
  );
  if (leftOut.length === 0) return null;
  return (
    <div className={className} style={style}>
      <Notice variant="warning">
        <span className="font-medium">
          {leftOut.length} item{leftOut.length !== 1 ? "s" : ""} didn’t make it in
        </span>
        {/* Bounded rather than truncated: a long list scrolls, so a compilation
            that lost twenty items says so twenty times instead of hiding the tail
            behind a count. */}
        <ul className="mt-1.5 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {leftOut.map((it) => (
            <li key={it.id} className="flex min-w-0 flex-col">
              <span className="truncate">{it.title}</span>
              {it.compile_note && (
                <span className="opacity-75">{it.compile_note}</span>
              )}
            </li>
          ))}
        </ul>
      </Notice>
    </div>
  );
}

// One format tile: its stone-tablet illustration on top (the carved preview the
// landing already showed for this format), then the format name, its
// destination, and the format's action(s) as children. No surrounding box — the
// tablet's own carved edge is the frame. The two outputs stay visual peers; the
// only accent is the gold on EPUB's primary download.
function OutputTile({
  tablet,
  format,
  destination,
  children,
}: {
  tablet: ReactNode;
  format: string;
  destination: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* The tablet is a desktop-only flourish: on a narrow screen the two would
          stack into a tall scroll, so below sm we keep just the label + action. */}
      <div className="hidden sm:block">{tablet}</div>
      <div className="flex flex-col gap-3 px-0.5">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium">{format}</span>
          <span className="text-muted-foreground text-xs">{destination}</span>
        </span>
        {children}
      </div>
    </div>
  );
}

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
}

// Pull the first real chapter — its title and the opening prose — out of the
// Markdown twin, for the EPUB slab's mini-preview (the actual first page of the
// book). Skips the "# Sources" index and any "# Preface" front matter, then the
// chapter's "::: {.source-attribution}" block, and flattens the first ~320 chars
// of body into clean prose (leading heading/quote/bullet markers and inline
// bold/italic/link/code/image syntax stripped) so it reads as a book page at the
// tiny slab size. Returns null when there's no chapter; `body` is "" when the
// chapter has no prose (e.g. all images), and the slab then shows its page bars.
function firstChapter(md: string): { title: string; body: string } | null {
  const lines = md.split("\n");
  let i = 0;
  let title = "";
  for (; i < lines.length; i++) {
    const m = /^#\s+(.*)/.exec(lines[i]);
    if (m && m[1].trim() !== "Sources" && m[1].trim() !== "Preface") {
      title = m[1].trim();
      break;
    }
  }
  if (i >= lines.length) return null;
  let j = i + 1;
  while (j < lines.length && lines[j].trim() === "") j++;
  if (lines[j]?.trim().startsWith(":::")) {
    j++;
    while (j < lines.length && !lines[j].trim().startsWith(":::")) j++;
    j++; // past the closing fence
  }
  const out: string[] = [];
  for (; j < lines.length && out.join(" ").length < 320; j++) {
    const t = lines[j].trim();
    if (/^#\s+/.test(t)) break; // reached the next chapter (H1)
    if (/^#{2,6}\s+/.test(t)) continue; // skip sub-headings; open on prose
    if (!t || t.startsWith(":::")) continue;
    const clean = t
      .replace(/^>\s?/, "")
      .replace(/^[-*]\s+/, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .trim();
    if (clean) out.push(clean);
  }
  return { title, body: out.join(" ").slice(0, 320) };
}

interface ReviewListProps {
  jobId: string;
  items: DiscoveredItem[];
  sources: Source[];
  selected: Set<string>;
  title: string;
  confirming: boolean;
  llm: LlmConfig | null;
  selectedRoles: Set<string>;
  onToggleRole: (id: string) => void;
  onSetRolesMany: (ids: string[], value: boolean) => void;
  onTitleChange: (title: string) => void;
  onToggle: (id: string) => void;
  onSelectItems: (ids: string[], value: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onConfirm: () => void;
  sourceOrder: number[];
  onReorderSources: (order: number[]) => void;
}

function ReviewList({
  jobId,
  items,
  sources,
  selected,
  title,
  confirming,
  llm,
  selectedRoles,
  onToggleRole,
  onSetRolesMany,
  onTitleChange,
  onToggle,
  onSelectItems,
  onSelectAll,
  onSelectNone,
  onConfirm,
  sourceOrder,
  onReorderSources,
}: ReviewListProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const scrollerRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleSourceDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = sourceOrder.indexOf(Number(active.id));
    const to = sourceOrder.indexOf(Number(over.id));
    if (from !== -1 && to !== -1) {
      onReorderSources(arrayMove(sourceOrder, from, to));
    }
  }

  // How many *selected* videos read raw (would benefit from the punctuate role).
  const unpunctuatedSelected = items.filter(
    (it) =>
      selected.has(it.id) &&
      it.item_type === "youtube" &&
      it.has_transcript === true &&
      it.is_punctuated === false,
  ).length;

  // Transcription availability gates the one unavoidable per-item cost: a
  // podcast's tag only wears the metered accent when STT can actually run, and
  // the legend under the list only appears when such an item is present.
  const sttAvailable = !!llm?.stt_available;
  const hasMeteredPodcast =
    sttAvailable && items.some((it) => it.item_type === "podcast");

  // Sources AI polish can actually act on: youtube captions and articles.
  // Podcasts keep their verbatim diarized dialogue, so on an all-podcast
  // selection the block is irrelevant and gets hidden (below).
  const polishableSelected = items.filter(
    (it) =>
      selected.has(it.id) &&
      (it.item_type === "youtube" || it.item_type === "blog"),
  ).length;

  // Live estimate of what this compile will cost in metered API calls, given
  // the current selection + roles. Recomputed as either changes.
  const cost = useMemo(
    () => estimateCost(items, selected, selectedRoles, llm),
    [items, selected, selectedRoles, llm],
  );

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? items.filter((it) => it.title.toLowerCase().includes(needle))
        : items,
    [items, needle],
  );

  // Group by source so a multi-source compilation stays legible instead of one
  // giant mixed list.
  const groupMap = useMemo(() => {
    const map = new Map<number, DiscoveredItem[]>();
    for (const it of filtered) {
      const bucket = map.get(it.source_index);
      if (bucket) bucket.push(it);
      else map.set(it.source_index, [it]);
    }
    return map;
  }, [filtered]);

  // Render groups in the user's source order, dropping any with no items left
  // after the title filter.
  const visibleGroups = useMemo(
    () =>
      sourceOrder
        .map((sourceIndex) => ({
          sourceIndex,
          groupItems: groupMap.get(sourceIndex) ?? [],
        }))
        .filter((g) => g.groupItems.length > 0),
    [sourceOrder, groupMap],
  );

  // Reordering is offered only with a clean (unfiltered) list of 2+ sources:
  // the SortableContext items must match what's on screen, and there's nothing
  // to reorder otherwise.
  const reorderable = needle === "" && sourceOrder.length > 1;

  // Bottom-only fade: the sticky source headers already mask the top (rows
  // vanish under an opaque header), so only the bottom edge dissolves. Re-measured
  // when the rendered content changes (filtering, collapsing, reordering).
  const scrollFade = useScrollFade(scrollerRef, { top: false }, [
    visibleGroups,
    collapsed,
  ]);

  const toggleCollapse = (index: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  // One source group: its sticky header (optional drag handle, collapse, count,
  // select toggle) and items. Shared by the sortable and plain render paths —
  // `handleProps` is the drag listeners when reordering is on, else null.
  const renderGroupBody = (
    sourceIndex: number,
    groupItems: DiscoveredItem[],
    handleProps: Record<string, unknown> | null,
  ) => {
    const ids = groupItems.map((it) => it.id);
    const selectedCount = ids.filter((id) => selected.has(id)).length;
    const allSelected = selectedCount === ids.length;
    // A search overrides the manual collapse state: a query the user can't see
    // the matches of is useless, so any group with hits is force-expanded while
    // filtering (the collapse state is kept and restored once the query clears).
    const isCollapsed = needle === "" && collapsed.has(sourceIndex);
    // When every item in the source is the same kind (a channel of videos, a
    // Wikipedia page of articles, a podcast of episodes), the per-row type pill
    // repeats what the group already is — so we show the kind ONCE in the header
    // and drop it from each row. A mixed group keeps its per-row pills.
    const kinds = new Set(groupItems.map((it) => kindFromItemType(it.item_type)));
    const uniformKind = kinds.size === 1 ? [...kinds][0] : null;
    // The header now reads like a source on the home page (a name in normal case,
    // its favicon + domain, its type) instead of an all-caps section divider, so
    // the two screens speak the same visual language. The domain is dropped when
    // it would just echo the name (the name fell back to the host already).
    const source = sources[sourceIndex];
    const url = source?.url ?? "";
    const title = groupLabel(source);
    const host = hostOf(url);
    // Show the domain in the meta line unless the title already fell back to it
    // (no captured name), so it's never printed twice.
    const showHost = host !== "" && host !== title;

    // A source that resolved to a single item has no group to manage (collapse,
    // select-all, a 1/1 count are all moot, and a header would just repeat the
    // lone item's title). Render it as one top-level source row instead — its
    // own domain + type inline, its drag handle on the row — mirroring how the
    // home page lists each source as a single line.
    if (groupItems.length === 1) {
      const only = groupItems[0];
      return (
        <ReviewItem
          jobId={jobId}
          item={only}
          checked={selected.has(only.id)}
          onToggle={() => onToggle(only.id)}
          sttAvailable={sttAvailable}
          sourceUrl={showHost ? url : undefined}
          dragHandleProps={handleProps}
          asSource
          highlight={needle}
        />
      );
    }

    const someSelected = selectedCount > 0 && !allSelected;
    return (
      <>
        {/* sticky is itself a positioned containing block, so the absolute soft
            fade below anchors to this header. Opaque (not /95) so rows vanish
            cleanly under it instead of ghosting through. Same px/gap as the item
            rows so the checkbox column lines up across header and items. */}
        <div className="bg-background sticky top-0 z-10 flex items-center gap-3.5 px-3.5 py-2.5">
          {handleProps && (
            <button
              type="button"
              aria-label="Drag to reorder source"
              className="text-muted-foreground/50 hover:text-foreground shrink-0 cursor-grab touch-none transition-colors active:cursor-grabbing"
              {...(handleProps as ButtonHTMLAttributes<HTMLButtonElement>)}
            >
              <GripVertical className="size-4" />
            </button>
          )}
          {/* Selection lives on the LEFT for every row. On a group it's a
              tri-state toggle for all the source's items (a dash when only some
              are picked), mirroring the per-item checkboxes beneath it. */}
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onCheckedChange={() => onSelectItems(ids, !allSelected)}
            aria-label={
              allSelected
                ? "Deselect all items in this source"
                : "Select all items in this source"
            }
          />
          <button
            type="button"
            onClick={() => toggleCollapse(sourceIndex)}
            aria-expanded={!isCollapsed}
            className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
          >
            <span className="truncate text-sm font-medium">{title}</span>
            <span className="text-muted-foreground flex min-w-0 items-center gap-x-1.5 text-xs">
              {uniformKind && (
                <SourceTypePill kind={uniformKind} className="shrink-0" />
              )}
              {showHost && (
                <>
                  {uniformKind && <MetaSep />}
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <SourceFavicon url={url} />
                    <span className="truncate">{host}</span>
                  </span>
                </>
              )}
              {(uniformKind || showHost) && <MetaSep />}
              <span className="shrink-0 tabular-nums">
                {selectedCount}/{groupItems.length}
              </span>
            </span>
          </button>
          {/* The disclosure (expand/collapse) lives on the RIGHT, in the same
              slot the per-item Preview button occupies on the rows below. A +/−
              reads as "show more / show less" there, where a chevron in a
              right-side button would read as navigate / open-a-menu. */}
          <Tooltip content={isCollapsed ? "Expand" : "Collapse"}>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => toggleCollapse(sourceIndex)}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? "Expand source" : "Collapse source"}
              className="shrink-0"
            >
              {isCollapsed ? <Plus /> : <Minus />}
            </Button>
          </Tooltip>
          {/* Soft edge under the sticky header: rows fade in as they emerge from
              under it rather than appearing on a hard line. Only when expanded —
              collapsed there are no rows to fade, and the span (absolute,
              top-full) would otherwise poke 16px past the content and summon a
              stray scrollbar. */}
          {!isCollapsed && (
            <span
              aria-hidden="true"
              className="from-background pointer-events-none absolute inset-x-0 top-full h-4 bg-gradient-to-b to-transparent"
            />
          )}
        </div>
        {!isCollapsed &&
          groupItems.map((item) => (
            <ReviewItem
              key={item.id}
              jobId={jobId}
              item={item}
              checked={selected.has(item.id)}
              onToggle={() => onToggle(item.id)}
              sttAvailable={sttAvailable}
              reserveGrip={reorderable}
              highlight={needle}
            />
          ))}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="book-title" className="text-muted-foreground text-xs">
            Compilation title
          </Label>
          <span className="text-muted-foreground/60 text-xs tabular-nums">
            {title.length}/{BOOK_TITLE_MAX}
          </span>
        </div>
        <Input
          id="book-title"
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Compilation title"
          maxLength={BOOK_TITLE_MAX}
          aria-required="true"
          autoComplete="off"
        />
      </div>

      {/* Bulk selection lives on the LEFT, as a tri-state checkbox mirroring the
          per-source group headers — every "select this" affordance on the screen
          is a checkbox in the left column, so the master belongs there too. The
          count is status, not a heading, so it rides along muted. */}
      <label className="flex w-fit cursor-pointer items-center gap-3 text-sm">
        <Checkbox
          checked={items.length > 0 && selected.size === items.length}
          indeterminate={selected.size > 0 && selected.size < items.length}
          onCheckedChange={() =>
            selected.size === items.length ? onSelectNone() : onSelectAll()
          }
          aria-label={
            selected.size === items.length && items.length > 0
              ? "Deselect all items"
              : "Select all items"
          }
        />
        <span className="text-muted-foreground">
          {selected.size} of {items.length} selected
        </span>
      </label>

      {items.length > 8 && (
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles…"
            className="pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
            autoComplete="off"
          />
          {query !== "" && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      <div
        ref={scrollerRef}
        className="-mx-2 flex max-h-[55vh] flex-col gap-2 overflow-y-auto"
        style={scrollFade}
      >
        {visibleGroups.length === 0 ? (
          <p className="text-muted-foreground px-3 py-8 text-center text-sm">
            No results for “{query}”
          </p>
        ) : reorderable ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSourceDragEnd}
          >
            <SortableContext
              items={sourceOrder.map(String)}
              strategy={verticalListSortingStrategy}
            >
              {visibleGroups.map(({ sourceIndex, groupItems }) => (
                <SortableSourceGroup key={sourceIndex} sourceIndex={sourceIndex}>
                  {(handleProps) =>
                    renderGroupBody(sourceIndex, groupItems, handleProps)
                  }
                </SortableSourceGroup>
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          visibleGroups.map(({ sourceIndex, groupItems }) => (
            <div key={sourceIndex} className="flex flex-col">
              {renderGroupBody(sourceIndex, groupItems, null)}
            </div>
          ))
        )}
      </div>

      {/* Legend for the one paid-path accent in the list: it appears only when a
          metered podcast is actually present, so the gold tag never goes
          unexplained — and never shows when there's nothing to explain. */}
      {hasMeteredPodcast && (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <Coins className="text-gold-deep dark:text-gold mt-px size-3.5 shrink-0" />
          <span>
            <span className="text-foreground font-medium">Metered either way</span>{" "}
            (transcribing audio). Everything else is free unless you turn on AI
            polish.
          </span>
        </p>
      )}

      {llm &&
        llm.available &&
        llm.roles.length > 0 &&
        polishableSelected > 0 && (
          <RoleSelector
            llm={llm}
            selectedRoles={selectedRoles}
            onToggleRole={onToggleRole}
            onSetRolesMany={onSetRolesMany}
            unpunctuatedSelected={unpunctuatedSelected}
          />
        )}

      {/* Cost sits right against the action — one decision. The button itself
          says what's blocking it (no source / no title) rather than a separate
          hint, so the message is where the click is. */}
      <div className="flex flex-col gap-2">
        {selected.size > 0 && <CostEstimate cost={cost} />}
        <Button
          size="lg"
          onClick={onConfirm}
          disabled={confirming || selected.size === 0 || title.trim() === ""}
          className="w-full"
        >
          {confirming
            ? "Starting…"
            : selected.size === 0
              ? "Select a source"
              : title.trim() === ""
                ? "Add a title"
                : "Generate"}
        </Button>
      </div>
    </div>
  );
}

// A drag-sortable wrapper for one source group. Keyed by the source index; hands
// the drag listeners to its child so the grip in the header is the only handle
// (the rows themselves stay clickable). Lifts above its neighbours while held.
function SortableSourceGroup({
  sourceIndex,
  children,
}: {
  sourceIndex: number;
  children: (handleProps: Record<string, unknown>) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: String(sourceIndex) });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex flex-col", isDragging && "relative z-20 opacity-90")}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

interface ReviewItemProps {
  jobId: string;
  item: DiscoveredItem;
  checked: boolean;
  onToggle: () => void;
  // Whether speech-to-text is configured. Only a podcast's tag reads it: with STT
  // on, transcription is metered, so the tag wears the paid-path accent.
  sttAvailable: boolean;
  // When this row IS a whole single-item source (no group header above it), its
  // domain is shown inline (favicon + host) so it still reads as a top-level
  // source, and a drag handle is rendered so it can still be reordered.
  sourceUrl?: string;
  dragHandleProps?: Record<string, unknown> | null;
  // Style the title with header weight (font-medium) so a single-item source
  // reads as a source header — a peer of the multi-item group headers — rather
  // than as a loose list item.
  asSource?: boolean;
  // Reserve an empty grip-width gutter so a grouped item's checkbox lines up
  // under its (draggable) source header's checkbox. Only needed while reordering
  // is on — the header then has a real grip in that column.
  reserveGrip?: boolean;
  // The active search term (lower-cased), highlighted within the title so it's
  // clear why the row matched. Empty when not filtering.
  highlight?: string;
}

// One review row: the selection checkbox + metadata, plus an on-demand preview
// of the exact no-LLM content this item would contribute (so you can see what
// you're keeping before compiling). The preview is fetched lazily on first
// expand and then cached locally.
function ReviewItem({
  jobId,
  item,
  checked,
  onToggle,
  sttAvailable,
  sourceUrl,
  dragHandleProps,
  asSource,
  reserveGrip,
  highlight,
}: ReviewItemProps) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ItemPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (!next || preview || loading) return;
    setLoading(true);
    setError(null);
    try {
      setPreview(await fetchItemPreview(jobId, item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // The meta line is deliberately spare: the content tag (what was retrieved +
  // whether it needs work), and — only for a single-item source — its domain.
  // Length metrics (word count, language, read/play time) were dropped here on
  // purpose: at review the decision is "include or not / polish or not", which
  // they don't drive, and they were available for some kinds and not others
  // (four on a video, one on a podcast, none on an article), which read as
  // inconsistent. Length now lives where it's actionable — the per-item preview
  // and the aggregate cost estimate.
  const metaParts: ReactNode[] = [contentTag(item, sttAvailable)];
  if (sourceUrl) {
    metaParts.push(
      <span className="inline-flex shrink-0 items-center gap-1">
        <SourceFavicon url={sourceUrl} />
        {hostOf(sourceUrl)}
      </span>,
    );
  }

  const metaClass =
    "text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs";

  return (
    <div
      className={cn(
        "rounded-lg transition-colors",
        // foreground-alpha (not bg-muted) so it never collides with the
        // secondary Preview button — in dark, --muted and --secondary share the
        // same value, which made the button melt into the hovered row.
        checked ? "bg-foreground/[0.06]" : "hover:bg-foreground/5",
      )}
    >
      <div className="flex items-center gap-3.5 px-3.5 py-3.5">
        {dragHandleProps ? (
          <button
            type="button"
            aria-label="Drag to reorder source"
            className="text-muted-foreground/50 hover:text-foreground shrink-0 cursor-grab touch-none transition-colors active:cursor-grabbing"
            {...(dragHandleProps as ButtonHTMLAttributes<HTMLButtonElement>)}
          >
            <GripVertical className="size-4" />
          </button>
        ) : reserveGrip ? (
          <span className="w-4 shrink-0" aria-hidden="true" />
        ) : null}
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5">
          <Checkbox checked={checked} onCheckedChange={onToggle} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={cn("truncate text-sm", asSource && "font-medium")}>
              {highlightMatch(item.title, highlight ?? "")}
            </span>
            {metaParts.length > 0 && (
              <span className={metaClass}>
                {metaParts.map((node, i) => (
                  <Fragment key={i}>
                    {i > 0 && <MetaSep />}
                    {node}
                  </Fragment>
                ))}
              </span>
            )}
          </span>
        </label>
        <Tooltip content={open ? "Hide preview" : "Preview"}>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={toggleOpen}
            aria-expanded={open}
            aria-label={open ? "Hide preview" : "Preview"}
            className="ml-2 shrink-0"
          >
            {open ? <EyeOff /> : <Eye />}
          </Button>
        </Tooltip>
      </div>

      {open && (
        <div className="px-3.5 pb-3 pl-10">
          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-2 text-xs">
              <Spinner className="size-3.5" />
              Loading preview…
            </div>
          ) : error ? (
            <p className="text-destructive text-xs">{error}</p>
          ) : preview ? (
            <PreviewBody preview={preview} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function PreviewBody({ preview }: { preview: ItemPreview }) {
  // The excerpt box has no sticky header, so it fades on BOTH edges that hide
  // content — the same softening the lists get, so a long preview dissolves at
  // top and bottom instead of being sliced on a hard line.
  const excerptRef = useRef<HTMLDivElement>(null);
  const fade = useScrollFade(excerptRef, { top: true, bottom: true }, [
    preview.content_md,
  ]);

  if (!preview.available) {
    return (
      <p className="text-muted-foreground text-xs">
        {preview.note ?? "No preview available."}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {preview.note && (
        <p className="text-warning text-xs">{preview.note}</p>
      )}
      {/* A quoted excerpt, NOT an editor: a full bordered + filled box reads as
          a textarea and implies you can type in it. A left rule (blockquote)
          with a barely-there fill reads as displayed source text. */}
      <div
        ref={excerptRef}
        style={fade}
        className="border-border/60 bg-muted/20 max-h-72 overflow-y-auto rounded-r-md border-l-2 py-2 pr-3 pl-4"
      >
        <MarkdownPreview md={preview.content_md ?? ""} />
      </div>
      {preview.truncated && (
        <p className="text-muted-foreground text-xs">
          Preview trimmed. The full text is used when compiling.
        </p>
      )}
    </div>
  );
}

// A deliberately small Markdown renderer for the narrow subset the compiler
// emits (## headings, **bold** speaker labels, bullet lists, links). Avoids
// pulling in a Markdown dependency for what is just a read-only preview.
function MarkdownPreview({ md }: { md: string }) {
  const blocks = md.split(/\n{2,}/).filter((b) => b.trim());
  return (
    <div className="text-muted-foreground flex flex-col gap-2 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        const heading = /^(#{1,6})\s+(.*)$/.exec(block);
        if (heading) {
          return (
            <p key={i} className="text-foreground mt-1 font-semibold">
              {renderInline(heading[2])}
            </p>
          );
        }
        if (/^\s*[-*]\s+/.test(block)) {
          const lines = block.split("\n").map((l) => l.replace(/^\s*[-*]\s+/, ""));
          return (
            <ul key={i} className="list-disc pl-5">
              {lines.map((line, j) => (
                <li key={j}>{renderInline(line)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(block.replace(/\n/g, " "))}</p>;
      })}
    </div>
  );
}

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g;

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] != null) {
      nodes.push(<strong key={key++}>{match[1]}</strong>);
    } else if (match[2] != null) {
      nodes.push(
        <a
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          {match[2]}
        </a>,
      );
    } else if (match[4] != null) {
      nodes.push(
        <code key={key++} className="bg-muted rounded px-1 text-[0.85em]">
          {match[4]}
        </code>,
      );
    }
    last = INLINE.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

interface RoleSelectorProps {
  llm: LlmConfig;
  selectedRoles: Set<string>;
  onToggleRole: (id: string) => void;
  onSetRolesMany: (ids: string[], value: boolean) => void;
  unpunctuatedSelected: number;
}

// AI polish, the one paid path, presented as a single master switch: on engages
// the safe set (a copyedit pass; punctuation already runs on its own), off
// clears every optional pass. The opinionated extras that invent structure or
// generate text (sections, preface) hide behind "Customize", opt-in one by one.
// Roles are grouped by their backend `tier` so the ids stay out of the UI.
// Only rendered when a model is configured (caller gates on llm.available).
function RoleSelector({
  llm,
  selectedRoles,
  onToggleRole,
  onSetRolesMany,
  unpunctuatedSelected,
}: RoleSelectorProps) {
  const defaultIds = llm.roles
    .filter((r) => r.tier === "default")
    .map((r) => r.id);
  const extraRoles = llm.roles.filter((r) => r.tier === "extra");
  const extraIds = extraRoles.map((r) => r.id);

  // Engaged once the safe set is on. Falls back to "any opt-in role" if a build
  // ever ships no default-tier role, so the switch never gets stuck off.
  const masterOn =
    defaultIds.length > 0
      ? defaultIds.every((id) => selectedRoles.has(id))
      : selectedRoles.size > 0;

  function setMaster(on: boolean) {
    if (on) onSetRolesMany(defaultIds, true);
    else onSetRolesMany([...defaultIds, ...extraIds], false);
  }

  const plural = unpunctuatedSelected !== 1 ? "s" : "";
  const subtext = masterOn
    ? "Punctuation where it's missing, plus a light copyedit."
    : unpunctuatedSelected > 0
      ? `${unpunctuatedSelected} raw transcript${plural} would read rough. Turn on to punctuate them.`
      : "Tidy wording and fix small transcription slips.";

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        // Dashed + muted while off (reads as "optional, secondary to the free
        // path"); once engaged it firms into a gold-edged panel so the one paid
        // path carries the brand's single accent color.
        masterOn ? "border-gold/30 bg-foreground/[0.02]" : "border-dashed",
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          aria-hidden
          className="bg-gold/10 text-gold-deep dark:text-gold flex size-7 shrink-0 items-center justify-center rounded-lg"
        >
          <Sparkles className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">AI polish</span>
          <span className="text-muted-foreground text-xs">{subtext}</span>
        </span>
        <Switch
          checked={masterOn}
          onCheckedChange={setMaster}
          aria-label="AI polish"
          className="shrink-0"
        />
      </div>

      {masterOn && extraRoles.length > 0 && (
        <div className="px-4 pb-4">
          <ul className="border-border/70 flex flex-col gap-1 border-t pt-3">
            {extraRoles.map((role) => {
              const checked = selectedRoles.has(role.id);
              return (
                <li key={role.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 transition-colors",
                      // A faint gold wash marks an active extra; idle rows only
                      // light up on hover.
                      checked ? "bg-gold/[0.07]" : "hover:bg-foreground/5",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggleRole(role.id)}
                      className="mt-0.5"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm leading-none font-medium">
                        {role.label}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {role.description}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// The title for a source group — always the real name the backend captured at
// discovery (channel / playlist / blog / video title), so every header reads the
// same way: a title on top, the domain + type in the meta line beneath it. Only
// when no name was captured does it fall back to the bare host.
function groupLabel(source: Source | undefined): string {
  return source?.name?.trim() || hostOf(source?.url ?? "");
}

// A compact, recognizable label derived from the URL the user entered
// (e.g. "youtube.com/@channel", "jakub.kr") — the last-resort fallback when no
// title or discovered name is available. A YouTube watch URL carries its
// identity in the dropped `?v=` query, so the bare path "youtube.com/watch"
// names every video identically; reading it as the kind it is ("YouTube video")
// is at least honest rather than a misleading repeat.
function sourceLabel(url: string | undefined): string {
  if (!url) return "Source";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be" || (host.endsWith("youtube.com") && parsed.pathname === "/watch")) {
      return "YouTube video";
    }
    const path = parsed.pathname.replace(/\/+$/, "");
    return path && path !== "" ? `${host}${path}` : host;
  } catch {
    return url;
  }
}

// The leading tag on every review row: what was actually retrieved for this
// item, and — by its wording — whether it will need work. At review the medium
// (Video / Episode / Article) is the least useful thing to repeat: the source
// header and favicon already say it. What drives the decision here is the
// content state, so that takes the lead slot. Factual and neutral, never an
// alert — the wording carries the meaning (a clean "Transcript" vs. rough "Raw
// captions"), so only the one genuinely empty case ("No subtitles") gets color.
// Always returns a tag: at this screen, confirming what each item contributes
// is the whole point, so the clean cases state themselves too.
//
// One item kind carries an unavoidable cost: a podcast has no text until it's
// transcribed (metered STT), so when transcription is available its tag wears
// the brand's paid-path accent (gold + coin) — the cue that this one costs to
// include no matter what, while everything else is free unless AI polish is on.
// "Web text" (not "Article") names what was pulled from a page so it never reads
// as a duplicate of the "Article" type pill the source header already shows.
function contentTag(item: DiscoveredItem, sttAvailable: boolean) {
  if (item.item_type === "podcast") {
    return sttAvailable ? (
      // Coin sits AFTER the label so this tag's marker is on the same side as
      // the "Raw captions" info icon — side-by-side in the list, mismatched
      // sides read as untidy. The bottom legend (visible, not a hover tip) is
      // this tag's explanation, so it needs no tooltip of its own.
      <Badge variant="secondary" className="bg-gold/10 text-gold-deep dark:text-gold gap-1">
        From audio
        <Coins />
      </Badge>
    ) : (
      <Badge variant="secondary">From audio</Badge>
    );
  }
  if (item.item_type === "blog") {
    return <Badge variant="secondary">Web text</Badge>;
  }
  // YouTube: the content state varies per item, so this is where it earns its
  // place — clean transcript, rough auto-captions, or nothing usable.
  if (item.has_transcript === false) {
    return <Badge variant="destructive">No subtitles</Badge>;
  }
  if (item.has_transcript == null) {
    return <Badge variant="secondary">Subtitles unchecked</Badge>;
  }
  if (item.is_punctuated === false) {
    // Neutral, not an alarm: raw captions still work, they just read rougher.
    // A hover/focus tip explains what the term means (the word alone may not
    // convey it, and the AI-polish nudge below isn't shown when no model is
    // set). It only DESCRIBES the state — offering the fix is the polish panel's
    // job, and that panel exists only when there's a fix to offer.
    return (
      <Tooltip content="Auto-generated captions, without punctuation, so they read a bit rough as-is.">
        <Badge variant="secondary" tabIndex={0}>
          Raw captions
          {/* A visible marker that there's a note here — a bare hover tip can't
              be guessed at. Neutral, so it informs without alarming. */}
          <Info className="opacity-60" />
        </Badge>
      </Tooltip>
    );
  }
  return <Badge variant="secondary">Transcript</Badge>;
}

// --- Pre-compile cost estimate -------------------------------------------------
// Mirrors the backend's auto-passes so the figure matches what will actually run:
// podcasts are transcribed (STT) + speaker-named (small LLM call), raw YouTube
// captions are auto-punctuated (LLM), and any ticked roles add a pass. Token
// counts are rough (faithful passes keep ~the same length), so it's a ballpark.
const TOKENS_PER_WORD = 1.33;

function estimateCost(
  items: DiscoveredItem[],
  selected: Set<string>,
  roles: Set<string>,
  llm: LlmConfig | null,
): { stt: number; llm: number } {
  if (!llm) return { stt: 0, llm: 0 };
  const { available, stt_available, pricing } = llm;
  const hasPunctuate = roles.has("punctuate");
  const hasCopyedit = roles.has("copyedit");
  const hasSections = roles.has("sections");

  const pass = (words: number) => {
    if (words <= 0) return 0;
    const tin = words * TOKENS_PER_WORD;
    const tout = words * TOKENS_PER_WORD; // faithful passes ≈ same length out
    return (tin * pricing.llm_per_mtok_in + tout * pricing.llm_per_mtok_out) / 1e6;
  };

  let stt = 0;
  let llmCost = 0;

  for (const it of items) {
    if (!selected.has(it.id)) continue;

    if (it.item_type === "podcast") {
      // Podcasts only cost transcription: they keep their raw diarized dialogue,
      // with no LLM editing or naming pass by default.
      const minutes = (it.estimated_duration_s ?? 0) / 60;
      if (stt_available) stt += minutes * pricing.stt_per_minute;
    } else if (it.item_type === "youtube") {
      if (it.has_transcript === false || !available) continue;
      const words = it.word_count ?? 0;
      // Punctuation only runs when AI polish is on, and only on raw captions
      // (clean_transcript free-splits ones that are already punctuated).
      if (hasPunctuate && it.is_punctuated === false) llmCost += pass(words);
      if (hasCopyedit) llmCost += pass(words);
      if (hasSections) llmCost += pass(words);
    } else if (available) {
      // Blog: only the manually-selected roles cost anything.
      const words = (it.estimated_size_chars ?? 0) / 6;
      if (hasCopyedit) llmCost += pass(words);
      if (hasSections) llmCost += pass(words);
    }
  }

  return { stt, llm: llmCost };
}

function formatUsd(value: number): string {
  if (value <= 0) return "$0.00";
  if (value < 0.01) return "< $0.01";
  return `$${value.toFixed(2)}`;
}

function CostEstimate({ cost }: { cost: { stt: number; llm: number } }) {
  const total = cost.stt + cost.llm;

  const parts: string[] = [];
  if (cost.stt > 0) parts.push(`transcription ${formatUsd(cost.stt)}`);
  if (cost.llm > 0) parts.push(`AI polish ${formatUsd(cost.llm)}`);

  // "Free" is the headline, not a blank line: when nothing is metered, say so.
  // It's the zero-LLM promise paying off, worth affirming at the decision point.
  const totalLabel =
    total <= 0 ? "Free" : total < 0.01 ? "< $0.01" : `~$${total.toFixed(2)}`;

  return (
    <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
      <span>Estimated cost</span>
      <span className="text-right">
        <span className="text-foreground font-medium">{totalLabel}</span>
        {parts.length > 1 && <span className="ml-1">({parts.join(" · ")})</span>}
      </span>
    </div>
  );
}
