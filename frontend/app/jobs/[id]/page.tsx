"use client";

import { EnterKey, Kbd, ModKey } from "@/components/ui/kbd";
import { useShortcut } from "@/lib/shortcuts";
import {
  Fragment,
  ViewTransition,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Ban,
  Check,
  CircleHelp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Minus,
  Plus,
  Search,
  TriangleAlert,
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
import { BookActions } from "@/components/book-actions";
import { Progress } from "@/components/ui/progress";
import { Notice } from "@/components/ui/notice";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Logomark } from "@/components/brand";
import { AppHeader } from "@/components/app-header";
import { BackLink } from "@/components/back-link";
import {
  CompilationPane,
  WorkPane,
  Workspace,
} from "@/components/compilation-pane";
import {
  MetaSep,
  SourceFavicon,
  SourceTypePill,
  hostOf,
  kindFromItemType,
} from "@/components/source-kind";
import { ConnectModelStep, type ModelKind } from "@/components/connect-model";
import { recordCompilation } from "@/lib/history";
import { clearDraft, restoreJobDraft } from "@/lib/workspace-draft";
import { toVisitorEndpoint, withBrowserModels, type StoredEndpoint } from "@/lib/model-keys";
import { useStoredModels } from "@/lib/use-stored-models";
import { cn } from "@/lib/utils";
import { BookContents, BookReader, MarkdownPreview, countWords, splitBook } from "@/components/book";
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

// Podcast episodes are the one item whose compile has a real cost (each is
// transcribed, billed per minute) and a whole feed can list hundreds. So only the
// first PODCAST_PRESELECT of each source start selected; everything else, and
// every free item, is pre-selected as usual. The user can still select them all.
// A homepage link discovery wasn't sure about (a mention in the page's prose)
// starts unselected too: it's listed so the user can pick it, not assumed.
const PODCAST_PRESELECT = 10;

// ponytail: "newest" = feed order (item_index), which is newest-first in
// practice; sort by publish date if a feed ever proves otherwise.
function defaultSelection(items: DiscoveredItem[]): Set<string> {
  return new Set(
    items
      .filter(
        (it) =>
          !it.uncertain &&
          !it.set_aside &&
          (it.item_type !== "podcast" || it.item_index < PODCAST_PRESELECT),
      )
      .map((it) => it.id),
  );
}

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
  const router = useRouter();
  // N starts a new compilation from any step, like the New compilation button.
  useShortcut("n", () => {
    clearDraft();
    router.push("/");
  });
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
  // A key the visitor saved in this browser counts as much as the server's own.
  const storedModels = useStoredModels();
  const effectiveLlm = useMemo(
    () => withBrowserModels(llm, storedModels),
    [llm, storedModels],
  );
  const [roles, setRoles] = useState<Set<string>>(new Set());
  // The compile order of the sources, drag-reorderable in review. Source indices
  // in display order; selected ids are flattened in this order on confirm.
  const [sourceOrder, setSourceOrder] = useState<number[]>([]);

  // Apply a fetched job, animating the card (flow-card ViewTransition) only when
  // the PHASE changes — discovering → reviewing → processing → completed — so
  // each phase cross-fades like the home card does, while the frequent in-phase
  // polls (per-source discovery progress) update instantly without flicker.
  const lastStatusRef = useRef<string | null>(null);
  // What the browser last stored about this job, so the write below can be
  // skipped when nothing the snapshot holds has moved.
  const lastSnapshotRef = useRef<string | null>(null);
  const applyJob = useCallback((data: JobResponse) => {
    // Opening a job page is what puts it in this browser's history, so a link
    // someone shared with you joins your list the way a page you visited joins
    // browser history, and the title and status track the live job for free.
    // Guarded because every poll passes through here: rewriting storage every
    // two seconds during a compile would buy nothing.
    const snapshot = JSON.stringify([data.book_title, data.status]);
    if (snapshot !== lastSnapshotRef.current) {
      lastSnapshotRef.current = snapshot;
      recordCompilation(data);
    }
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
          podcast_transcripts: false,
          roles: [],
          pricing: { stt_per_minute: 0, llm_per_mtok_in: 0, llm_per_mtok_out: 0 },
          providers: [],
          custom_base_url_allowed: false,
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
      const initial = defaultSelection(job.discovered_items);
      setSelected(initial);
      // Editable default name (from the default selection); it stays in sync
      // with the selection until the user edits it, and is required to generate.
      // A title typed in the workspace is the user's own: keep it, frozen.
      if (job.title_named && job.book_title) {
        setTitle(job.book_title);
        setTitleIsAuto(false);
      } else {
        setTitle(autoTitleForSelection(job, initial) ?? "");
        setTitleIsAuto(true);
      }
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
    // A stored key only travels when this compilation will use it: the model
    // with AI polish on, transcription with a podcast selected.
    const podcastSelected = job.discovered_items.some(
      (it) => selected.has(it.id) && it.item_type === "podcast",
    );
    const visitor = {
      llm: roles.size > 0 && storedModels.llm ? toVisitorEndpoint(storedModels.llm) : undefined,
      stt: podcastSelected && storedModels.stt ? toVisitorEndpoint(storedModels.stt) : undefined,
    };
    try {
      const updated = await confirmJob(
        id,
        orderedIds,
        title.trim() || undefined,
        [...roles],
        visitor,
      );
      applyJob(updated);
      setPollKey((k) => k + 1); // resume polling for the compilation phase
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  }

  // The one way out of a finished or failed compilation.
  const newCompilation = (
    <Link
      href="/"
      onClick={clearDraft}
      className={cn(buttonVariants({ variant: "outline" }), "w-full")}
    >
      New compilation
      <Kbd>N</Kbd>
    </Link>
  );

  // Each step fills both panes: what it is working on, on the left; the
  // compilation, on the right. Review and the finished book lay out their own
  // two panes; the simpler steps are laid out here.
  let panes: ReactNode;
  if (!job) {
    panes = (
      <>
        <WorkPane>
          {error ? (
            <Notice variant="error">{error}</Notice>
          ) : (
            <StatusMessage label="Loading…" />
          )}
        </WorkPane>
        <CompilationPane
          eyebrow="Opening"
          title="Loading…"
          titleClassName="text-muted-foreground"
          footer={error ? newCompilation : <WaitingButton label="Loading…" />}
        />
      </>
    );
  } else if (job.status === "pending" || job.status === "discovering") {
    const n = job.sources.length;
    panes = (
      <>
        <WorkPane>
          <BackToSources jobId={id} sources={job.sources} title={job.book_title} />
          <DiscoveringView sources={job.sources} />
        </WorkPane>
        <CompilationPane
          eyebrow="Finding sources"
          title={job.book_title ?? ""}
          meta={`${n} source${n !== 1 ? "s" : ""}`}
          footer={<WaitingButton label="Finding sources…" />}
        >
          <p className="text-muted-foreground text-sm leading-relaxed">
            Listing what each source contains. You pick what goes in next.
          </p>
        </CompilationPane>
      </>
    );
  } else if (job.status === "reviewing") {
    panes = (
      <ReviewList
        jobId={id}
        items={job.discovered_items}
        sources={job.sources}
        selected={selected}
        title={title}
        confirming={confirming}
        error={error}
        llm={effectiveLlm}
        selectedRoles={roles}
        onToggleRole={toggleRole}
        onSetRolesMany={setRolesMany}
        onTitleChange={onTitleChange}
        onToggle={toggle}
        onSelectItems={selectItems}
        onSelectAll={() =>
          // Uncertain links stay out: they're picked from their own fold.
          setSelected(
            new Set(
              (job.discovered_items.some((it) => !it.uncertain)
                ? job.discovered_items.filter((it) => !it.uncertain)
                : job.discovered_items
              ).map((it) => it.id),
            ),
          )
        }
        onSelectNone={() => setSelected(new Set())}
        onConfirm={onConfirm}
        sourceOrder={sourceOrder}
        onReorderSources={setSourceOrder}
      />
    );
  } else if (job.status === "processing") {
    const built = job.discovered_items.filter(
      (it) => it.compile_state === "done",
    ).length;
    panes = (
      <>
        <WorkPane>
          <CompilingView items={job.discovered_items} />
        </WorkPane>
        <CompilationPane
          eyebrow="Compiling"
          title={job.book_title ?? ""}
          meta={`${built} of ${job.discovered_items.length} ready`}
          footer={<WaitingButton label="Compiling…" />}
        >
          <p className="text-muted-foreground text-sm leading-relaxed">
            This can take a few minutes. It keeps going if you leave, and waits
            for you in Your compilations.
          </p>
        </CompilationPane>
      </>
    );
  } else if (job.status === "completed") {
    panes = (
      <CompletedView jobId={id} job={job} />
    );
  } else {
    panes = (
      <>
        <WorkPane>
          <FailedView job={job} />
        </WorkPane>
        <CompilationPane
          eyebrow="Did not finish"
          title={job.book_title ?? ""}
          meta={`${job.sources.length} source${job.sources.length !== 1 ? "s" : ""}`}
          footer={newCompilation}
        />
      </>
    );
  }

  return (
    <div className="flex min-h-svh flex-col lg:h-svh">
      <AppHeader />
      <Workspace>
        {/* Each step arrives like a new page; the card itself morphs (flow-card). */}
        <ViewTransition key={job?.status ?? "opening"} enter="page" exit="page" default="none">
          {panes}
        </ViewTransition>
      </Workspace>
    </div>
  );
}

// Back to the workspace while the list can still change: the same sources and
// title come back there, and launching again starts a new compilation (this
// one stays in Your books).
function BackToSources({
  jobId,
  sources,
  title,
}: {
  jobId: string;
  sources: Source[];
  title: string | null;
}) {
  return (
    <BackLink href="/" onNavigate={() => restoreJobDraft(jobId, sources, title || null)}>
      Sources
    </BackLink>
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
// discovery resolves them one by one — done with an item tally, the current one
// scanning, the rest waiting — so the moment reads as continuous progress
// toward review, not a dead spinner over raw URLs.
function DiscoveringView({ sources }: { sources: Source[] }) {
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
          const label = s.name?.trim() || s.title?.trim() || sourceLabel(s.url);
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
                  {count} item{count !== 1 ? "s" : ""}
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
  return (
    <div className="flex flex-col gap-5">
      <WaitHeader
        label={building ? "Building the file" : "Writing your chapters"}
        done={items.filter((it) => it.compile_state && it.compile_state !== "pending" && it.compile_state !== "compiling").length}
        total={items.length}
      />
      <ul className="flex flex-col divide-y">
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
      {/* While an item is running, its note carries the stage it's in — a long
          transcript through the AI passes can hold the row for minutes, and a
          bare "building…" there reads as a hang. */}
      {active && (
        <span className="text-muted-foreground shrink-0">{note || "Writing"}</span>
      )}
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
function CompletedView({
  jobId,
  job,
}: {
  jobId: string;
  job: JobResponse;
}) {
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

  // The EPUB's weight, shown on its download. Read from the file itself.
  // ponytail: one extra fetch of a small file; expose the size on the job if it grows.
  const [epubBytes, setEpubBytes] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(getDownloadUrl(jobId))
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("fetch failed"))))
      .then((b) => {
        if (!cancelled) setEpubBytes(b.size);
      })
      .catch(() => {
        /* no weight shown; the download still works */
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);
  const chapters = useMemo(() => (md ? splitBook(md) : []), [md]);
  const [at, setAt] = useState(0);
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

  // The payoff. Arriving on this screen (the job just finished, or a completed
  // job opened) plays a one-shot arrival: the outputs cascade in. It
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
    "transition-[opacity,transform] duration-1000 ease-out-expo motion-reduce:transition-none";
  const riseIn = revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0";
  const delay = (ms: number) => ({
    transitionDelay: revealed ? `${ms}ms` : "0ms",
  });

  // D downloads the EPUB, C copies the Markdown, ← → turn the chapters.
  useShortcut("d", () => {
    const a = document.createElement("a");
    a.href = getDownloadUrl(jobId);
    a.download = "";
    a.click();
  });
  useShortcut("c", () => void copy(), !!md);
  useShortcut("arrowleft", () => setAt((i) => Math.max(0, i - 1)), chapters.length > 1);
  useShortcut("arrowright", () => setAt((i) => Math.min(chapters.length - 1, i + 1)), chapters.length > 1);

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

  const shownWords = useCountUp(words);
  const meta = `${sourceCount} source${sourceCount !== 1 ? "s" : ""}${
    shownWords != null ? ` · ~${shownWords.toLocaleString("en-US")} words` : ""
  }`;

  return (
    <>
      {/* The book itself, open on the left: the thing just made, to check
          before it goes to an e-reader or an AI. */}
      <WorkPane label="Your compilation">
        {md ? (
          <BookReader chapters={chapters} at={at} onGo={setAt} />
        ) : hasMarkdown ? (
          <StatusMessage label="Opening the compilation…" />
        ) : (
          <p className="text-muted-foreground text-sm">
            Download the EPUB to read it.
          </p>
        )}
      </WorkPane>

      <CompilationPane
        eyebrow={
          <>
            <Logomark className="h-3.5 w-auto" />
            Ready
          </>
        }
        title={job.book_title ?? ""}
        titleClassName="ink-in"
        meta={meta}
        // What you do with the book, pinned under its contents so a long
        // table never pushes the downloads off screen. EPUB is the one gold
        // action; the Markdown copy is for an AI; starting over is the quietest.
        footer={
          <div className={cn("flex flex-col gap-2", rise, riseIn)} style={delay(350)}>
            {/* The gold menu on its own line (download a format, or send to an
                e-reader), the two quieter actions side by side under it. */}
            <BookActions
              epubUrl={getDownloadUrl(jobId)}
              mdUrl={hasMarkdown ? getDownloadUrl(jobId, "md") : undefined}
              title={job.book_title ?? ""}
              epubNote={
                epubBytes != null
                  ? `For your e-reader · ${formatBytes(epubBytes)}`
                  : "For your e-reader"
              }
              mdNote={
                tokens != null ? `For an AI · ~${formatTokens(tokens)} tokens` : "For an AI"
              }
            />
            <div className="flex w-full gap-2">
              {hasMarkdown && (
                <Tooltip content="Copy the Markdown, to paste into an AI">
                  {/* Both labels share one grid cell, the idle one hidden, so
                      "Copied" never widens the button or shifts its row. */}
                  <Button type="button" variant="outline" onClick={copy} disabled={!md} aria-keyshortcuts="C" className="flex-1">
                    {copied ? <Check /> : <Copy />}
                    <span className="grid">
                      <span className={cn("col-start-1 row-start-1", copied && "invisible")}>Copy Markdown</span>
                      <span className={cn("col-start-1 row-start-1", !copied && "invisible")}>Markdown copied</span>
                    </span>
                    <Kbd>C</Kbd>
                  </Button>
                </Tooltip>
              )}
              <Link
                href="/"
                onClick={clearDraft}
                className={cn(buttonVariants({ variant: "ghost" }), "text-muted-foreground flex-1")}
              >
                New compilation
                <Kbd>N</Kbd>
              </Link>
            </div>
            {hasMarkdown && (
              <p className="text-muted-foreground text-xs">
                The full compilation as Markdown, ready to paste into an AI.
              </p>
            )}
            {tokens != null && tokens > 200000 && (
              <p className="text-muted-foreground text-xs">
                Large for some AIs: attaching the Markdown file may work better than pasting it.
              </p>
            )}
          </div>
        }
      >
        <BookContents chapters={chapters} at={at} onGo={setAt} />

        <LeftOutNotice
          items={job.discovered_items}
          className={cn(rise, riseIn)}
          style={delay(500)}
        />
      </CompilationPane>
    </>
  );
}

// A number that runs up to its value once, when it first arrives (the finished
// book's word count), easing out like the rest of the arrival.
function useCountUp(target: number | null, ms = 1200): number | null {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (target == null) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min((now - start) / ms, 1);
      setShown(Math.round(target * (1 - (1 - t) ** 4)));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return shown;
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
              <span className="truncate" title={it.title}>{it.title}</span>
              {it.compile_note && <span className="text-xs">{it.compile_note}</span>}
            </li>
          ))}
        </ul>
      </Notice>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
}

interface ReviewListProps {
  jobId: string;
  items: DiscoveredItem[];
  sources: Source[];
  selected: Set<string>;
  title: string;
  confirming: boolean;
  error: string | null;
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
  error,
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
  const [connecting, setConnecting] = useState<ModelKind | null>(null);
  // "All" means the items discovery is sure of, as on each source's checkbox
  // (uncertain links are picked from their own fold). A job of nothing but
  // uncertain links falls back to all of them.
  const masterItems = items.some((it) => !it.uncertain)
    ? items.filter((it) => !it.uncertain)
    : items;
  const masterSelected = masterItems.filter((it) => selected.has(it.id)).length;
  const allMaster = masterItems.length > 0 && masterSelected === masterItems.length;
  useShortcut("a", () => (allMaster ? onSelectNone() : onSelectAll()), items.length > 0);
  const storedModels = useStoredModels();
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  // Sources whose "uncertain links" fold is open. Closed by default: those
  // links are mostly noise and start unselected.
  const [uncertainOpen, setUncertainOpen] = useState<Set<number>>(new Set());

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
  // Issues surfaced up front, so nothing surprises at the end: selected
  // episodes that will be left out (no transcript, no transcription), and
  // selected videos whose captions have no punctuation.
  // An item the compile can't read (an episode with no transcript and no
  // transcription, a video with no subtitles) shows unchecked and greyed on its
  // own row. It stays in `selected`, so connecting transcription brings it back.
  const sttMissing = !!llm && !sttAvailable;
  const leftOut = (it: DiscoveredItem) => isLeftOut(it, sttMissing);
  const includedCount = items.filter(
    (it) => selected.has(it.id) && !leftOut(it),
  ).length;
  // Mod+Enter compiles (from the title field too); A selects or clears all.
  useShortcut("mod+enter", () => void onConfirm(), !confirming && includedCount > 0 && title.trim() !== "");
  const connectStt = llm && !sttAvailable ? () => setConnecting("stt") : undefined;
  // Raw-caption rows offer AI polish themselves, while it's available and off.
  const polishDefaultIds = (llm?.roles ?? [])
    .filter((r) => r.tier === "default")
    .map((r) => r.id);
  const polishOn =
    polishDefaultIds.length > 0 &&
    polishDefaultIds.every((id) => selectedRoles.has(id));
  const turnOnPolish =
    llm?.available && !polishOn && polishDefaultIds.length > 0
      ? () => onSetRolesMany(polishDefaultIds, true)
      : undefined;
  const sttPerMinute = llm?.pricing.stt_per_minute ?? 0;

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

  const toggleUncertain = (index: number) =>
    setUncertainOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

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
    // Links discovery wasn't sure about sit at the end, folded away, with a
    // checkbox of their own. The source's checkbox and count cover only the
    // items it's sure of: one click there must never pick links you can't see.
    const sureItems = groupItems.filter((it) => !it.uncertain);
    const unsureItems = groupItems.filter((it) => it.uncertain);
    const headerItems = sureItems.length > 0 ? sureItems : groupItems;
    const ids = headerItems.map((it) => it.id);
    const selectedCount = ids.filter((id) => selected.has(id)).length;
    const allSelected = selectedCount === ids.length;
    const unsureIds = unsureItems.map((it) => it.id);
    const unsureSelected = unsureIds.filter((id) => selected.has(id)).length;
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
          leftOut={leftOut(only)}
          onToggle={() => onToggle(only.id)}
          sttAvailable={sttAvailable}
          onConnectStt={connectStt}
          onPolish={turnOnPolish}
          sttPerMinute={sttPerMinute}
          sourceUrl={showHost ? url : undefined}
          dragHandleProps={handleProps}
          asSource
          highlight={needle}
        />
      );
    }

    const someSelected = selectedCount > 0 && !allSelected;
    // A search opens the fold, like it opens a collapsed source.
    const showUnsure = needle !== "" || uncertainOpen.has(sourceIndex);
    const renderChild = (item: DiscoveredItem) => (
      <ReviewItem
        key={item.id}
        jobId={jobId}
        item={item}
        checked={selected.has(item.id)}
        leftOut={leftOut(item)}
        onToggle={() => onToggle(item.id)}
        sttAvailable={sttAvailable}
        onConnectStt={connectStt}
          onPolish={turnOnPolish}
          sttPerMinute={sttPerMinute}
        highlight={needle}
        muted={item.uncertain}
      />
    );
    // Says why a long podcast feed doesn't start fully selected.
    const episodeCount = groupItems.filter(
      (it) => it.item_type === "podcast",
    ).length;
    const preselectNote =
      episodeCount > PODCAST_PRESELECT
        ? sttAvailable
          ? `Each episode is transcribed and billed per minute, so only the ${PODCAST_PRESELECT} newest start selected.`
          : `Only the ${PODCAST_PRESELECT} newest episodes start selected.`
        : null;
    return (
      <>
        {/* sticky is itself a positioned containing block, so the absolute soft
            fade below anchors to this header. Opaque (not /95) so rows vanish
            cleanly under it instead of ghosting through. Same px/gap as the item
            rows so the checkbox column lines up across header and items. */}
        <div className="bg-background sticky top-header z-10 lg:top-0">
          <div className="flex items-center gap-3.5 px-3.5 py-2.5">
            {handleProps && (
              /* The grip stays a 16px mark but sits in a 24x40 box: a bare button
                 shrink-wraps its icon, which left a 16x16 target on the one control
                 you have to catch AND drag. The box is real rather than a pseudo
                 element because the checkbox next door already extends its own hit
                 area 12px this way, and only a real box keeps the gap (and so the
                 clearance between the two targets) as it grows. */
              <button
                type="button"
                aria-label="Drag to reorder source"
                className="text-muted-foreground hover:text-foreground inline-grid h-10 w-6 shrink-0 cursor-grab place-items-center touch-none transition-colors active:cursor-grabbing"
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
                  {selectedCount}/{headerItems.length}
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
                variant="nav"
                size="icon-sm"
                onClick={() => toggleCollapse(sourceIndex)}
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? "Expand source" : "Collapse source"}
                className="shrink-0"
              >
                {isCollapsed ? <Plus /> : <Minus />}
              </Button>
            </Tooltip>
          </div>
          {preselectNote && (
            /* Inside the sticky header so it stays next to the count it
               explains. Laid out like the row above (grip and checkbox slots
               kept empty) so it starts under the source name. */
            <div className="-mt-1.5 flex gap-3.5 px-3.5 pb-2.5">
              {handleProps && (
                <span aria-hidden="true" className="w-6 shrink-0" />
              )}
              <span aria-hidden="true" className="w-5 shrink-0" />
              <p className="text-muted-foreground text-xs">{preselectNote}</p>
            </div>
          )}
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
        {!isCollapsed && (
          /* The children hang off a rail dropped from the source's checkbox, and
             start under the source's name: even scrolled deep into a long list,
             the line says these rows belong to the source above. ml puts the
             1px rail on the checkbox's centre (with or without a grip before
             it); pl lines each child's checkbox up under the source's title. */
          <div
            className={cn(
              "border-foreground/15 flex flex-col border-l pl-2.5",
              handleProps ? "ml-[61.5px]" : "ml-[23.5px]",
            )}
          >
            {sureItems.map(renderChild)}
            {sureItems.length > 0 && unsureItems.length > 0 && (
              <>
                {/* Built like a source header one level down (its own tri-state
                    checkbox, a live count, the +/- on the right), but set on a
                    tinted band with a help mark, so it reads as a divider over
                    a different kind of content and never as one more item. */}
                <div className="bg-foreground/[0.05] my-1 flex items-center gap-3.5 rounded-lg px-3.5 py-2.5">
                  <Checkbox
                    checked={unsureSelected === unsureIds.length}
                    indeterminate={
                      unsureSelected > 0 && unsureSelected < unsureIds.length
                    }
                    onCheckedChange={() =>
                      onSelectItems(
                        unsureIds,
                        unsureSelected !== unsureIds.length,
                      )
                    }
                    aria-label="Select all uncertain links"
                  />
                  <button
                    type="button"
                    onClick={() => toggleUncertain(sourceIndex)}
                    aria-expanded={showUnsure}
                    className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                  >
                    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
                      <CircleHelp className="size-3.5 shrink-0" aria-hidden="true" />
                      {unsureItems.length} uncertain{" "}
                      {unsureItems.length === 1 ? "link" : "links"}
                    </span>
                    <span className="text-muted-foreground flex min-w-0 items-center gap-x-1.5 text-xs">
                      <span className="truncate">
                        Mentioned in the page&apos;s text, not listed as articles
                      </span>
                      <MetaSep />
                      <span className="tabular-nums">
                        {unsureSelected}/{unsureItems.length}
                      </span>
                    </span>
                  </button>
                  <Tooltip content={showUnsure ? "Collapse" : "Expand"}>
                    <Button
                      type="button"
                      variant="nav"
                      size="icon-sm"
                      onClick={() => toggleUncertain(sourceIndex)}
                      aria-expanded={showUnsure}
                      aria-label={
                        showUnsure
                          ? "Hide uncertain links"
                          : "Show uncertain links"
                      }
                      className="shrink-0"
                    >
                      {showUnsure ? <Minus /> : <Plus />}
                    </Button>
                  </Tooltip>
                </div>
                {showUnsure && (
                  /* One level deeper, same grammar: a second rail dropped from
                     the fold's checkbox, so a fast scan of a long list still
                     tells the doubtful links from the source's real items. */
                  // Dashed where the source's rail is solid: the line itself
                  // says these hang on a guess.
                  <div className="border-foreground/20 ml-[23.5px] flex flex-col border-l border-dashed pl-2.5">
                    {unsureItems.map(renderChild)}
                  </div>
                )}
              </>
            )}
            {sureItems.length === 0 && unsureItems.map(renderChild)}
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <WorkPane label="Items">
      <BackToSources jobId={jobId} sources={sources} title={title} />
      {/* Bulk selection lives on the LEFT, as a tri-state checkbox mirroring the
          per-source group headers — every "select this" affordance on the screen
          is a checkbox in the left column, so the master belongs there too. The
          count is status, not a heading, so it rides along muted. */}
      <label className="flex w-fit cursor-pointer items-center gap-3 text-sm">
        <Checkbox
          checked={allMaster}
          indeterminate={selected.size > 0 && !allMaster}
          onCheckedChange={() =>
            allMaster ? onSelectNone() : onSelectAll()
          }
          aria-label={
            allMaster
              ? "Deselect all items"
              : "Select all items"
          }
        />
        <span className="text-muted-foreground">Select all</span>
        <Kbd className="text-muted-foreground">A</Kbd>
      </label>

      {/* No summary banner: each item's state and its fix live on its own row,
          and the pane on the right counts what goes in. */}

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
            <Button
              type="button"
              variant="nav"
              size="icon-sm"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              // An inset (top-1 centres 32px in the 40px field), not
              // -translate-y-1/2: Button's press translate would replace it.
              className="absolute top-1 right-1"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      )}

      <div className="-mx-2 flex flex-col gap-2">
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

      </WorkPane>

      {/* The compilation: its name, what goes in, the one optional cost, and the
          action. Polish and price sit here, against Compile, once we know what
          was found. */}
      <CompilationPane
        eyebrow="Review"
        title={title}
        onTitleChange={onTitleChange}
        meta={`${includedCount} of ${items.length} included`}
        footer={
          <>
            {error && <Notice variant="error">{error}</Notice>}
            {includedCount > 0 && <CostEstimate cost={cost} />}
            {/* The button says what's blocking it (no item / no title), so
                the message is where the click is. */}
            <Button
              onClick={onConfirm}
              disabled={confirming || includedCount === 0 || title.trim() === ""}
              aria-keyshortcuts="Control+Enter Meta+Enter"
              className="w-full"
            >
              {confirming
                ? "Starting…"
                : includedCount === 0
                  ? "Select an item"
                  : title.trim() === ""
                    ? "Add a title"
                    : "Compile"}
              {!confirming && includedCount > 0 && title.trim() !== "" && (
                <Kbd>
                  <ModKey /> <EnterKey />
                </Kbd>
              )}
            </Button>
          </>
        }
      >
        {llm && connecting ? (
          <ConnectModelStep kind={connecting} config={llm} onDone={() => setConnecting(null)} />
        ) : llm && llm.roles.length > 0 && polishableSelected > 0 ? (
          <RoleSelector
            onConnect={() => setConnecting("llm")}
            browserModel={storedModels.llm}
            llm={llm}
            selectedRoles={selectedRoles}
            onToggleRole={onToggleRole}
            onSetRolesMany={onSetRolesMany}
            unpunctuatedSelected={unpunctuatedSelected}
          />
        ) : (
          <p className="text-muted-foreground text-sm leading-relaxed">
            Pick what goes in on the left.
            {sourceOrder.length > 1 &&
              " Drag a source to change its place in the compilation."}
          </p>
        )}
      </CompilationPane>

    </>
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
  // The compile can't read this item: its checkbox shows unchecked and greyed,
  // and there's nothing to preview.
  leftOut?: boolean;
  onToggle: () => void;
  // Whether speech-to-text is configured. Only a podcast's tag reads it: with STT
  // on, transcription is metered, so the tag wears the paid-path accent.
  sttAvailable: boolean;
  // Set when an episode here can't be read without transcription and none is
  // connected: the row then offers the fix itself.
  onConnectStt?: () => void;
  // Set while AI polish is available and off: a raw-caption row offers it.
  onPolish?: () => void;
  // Transcription price, so a metered episode shows what it will cost.
  sttPerMinute?: number;
  // When this row IS a whole single-item source (no group header above it), its
  // domain is shown inline (favicon + host) so it still reads as a top-level
  // source, and a drag handle is rendered so it can still be reordered.
  sourceUrl?: string;
  dragHandleProps?: Record<string, unknown> | null;
  // Style the title with header weight (font-medium) so a single-item source
  // reads as a source header — a peer of the multi-item group headers — rather
  // than as a loose list item.
  asSource?: boolean;
  // The active search term (lower-cased), highlighted within the title so it's
  // clear why the row matched. Empty when not filtering.
  highlight?: string;
  // A link discovery wasn't sure about: its title is dimmed, so it reads as
  // secondary next to the source's real items.
  muted?: boolean;
}

// One review row: the selection checkbox + metadata, plus an on-demand preview
// of the exact no-LLM content this item would contribute (so you can see what
// you're keeping before compiling). The preview is fetched lazily on first
// expand and then cached locally.
function ReviewItem({
  jobId,
  item,
  checked,
  leftOut = false,
  onToggle,
  sttAvailable,
  onConnectStt,
  onPolish,
  sttPerMinute = 0,
  sourceUrl,
  dragHandleProps,
  asSource,
  highlight,
  muted,
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
  const metaParts: ReactNode[] = [contentTag(item, sttAvailable, sttPerMinute)];
  // The fix sits on the row it fixes, so the problem and its way out read together.
  const action =
    onConnectStt && needsTranscription(item)
      ? { label: "Connect transcription", run: onConnectStt }
      : onPolish &&
          item.item_type === "youtube" &&
          item.has_transcript === true &&
          item.is_punctuated === false
        ? { label: "Fix with AI polish", run: onPolish }
        : null;
  if (action) {
    metaParts.push(
      <button
        type="button"
        onClick={(e) => {
          // Inside the row's label: don't toggle the checkbox.
          e.preventDefault();
          action.run();
        }}
        className="text-foreground text-link font-medium"
      >
        {action.label}
      </button>,
    );
  }
  // The discovery triage's doubt, after the content tag: the item is kept,
  // only unchecked, and this says why.
  if (item.set_aside) {
    metaParts.push(
      <Tag className="text-warning">
        <TriangleAlert />
        {item.set_aside}, unchecked
      </Tag>,
    );
  }
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
  // An episode still to transcribe has no text yet (its tag already says how it
  // will get one), and a left-out item never will.
  const noPreview = leftOut || needsTranscription(item);

  return (
    <div
      className={cn(
        "rounded-lg transition-colors",
        // foreground-alpha (not bg-muted) so it never collides with the
        // secondary Preview button — in dark, --muted and --secondary share the
        // same value, which made the button melt into the hovered row.
        // No fill when picked: the checkbox says it once.
        "hover:bg-muted/50",
      )}
    >
      <div className="flex items-center gap-3.5 px-3.5 py-3.5">
        {dragHandleProps ? (
          /* Same 24x40 box as the group header's grip (see the note there), so a
             single-item source is as catchable as a group and the two rows keep
             one grip column. */
          <button
            type="button"
            aria-label="Drag to reorder source"
            className="text-muted-foreground hover:text-foreground inline-grid h-10 w-6 shrink-0 cursor-grab place-items-center touch-none transition-colors active:cursor-grabbing"
            {...(dragHandleProps as ButtonHTMLAttributes<HTMLButtonElement>)}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}
        <label
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3.5",
            !leftOut && "cursor-pointer",
          )}
        >
          <Checkbox
            checked={checked && !leftOut}
            disabled={leftOut}
            onCheckedChange={onToggle}
          />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span
              className={cn(
                "truncate text-sm",
                asSource && "font-medium",
                (muted || leftOut) && "text-muted-foreground",
              )}
            >
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
        {noPreview ? (
          // Nothing to read before compiling: the slot stays so the column of
          // eyes keeps its line.
          <span aria-hidden="true" className="ml-2 size-8 shrink-0" />
        ) : (
          <Tooltip content={open ? "Hide preview" : "Preview"}>
            <Button
              type="button"
              variant="nav"
              size="icon-sm"
              onClick={toggleOpen}
              aria-expanded={open}
              aria-label={open ? "Hide preview" : "Preview"}
              className="ml-2 shrink-0"
            >
              {open ? <EyeOff /> : <Eye />}
            </Button>
          </Tooltip>
        )}
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
            <PreviewBody
              preview={preview}
              rawCaptions={
                item.item_type === "youtube" && item.is_punctuated === false
              }
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function PreviewBody({
  preview,
  rawCaptions = false,
}: {
  preview: ItemPreview;
  // Raw auto-captions: the excerpt is labelled as such in its corner, so it's
  // never taken for the final text. The row above already says why and offers
  // the fix, so no sentence repeats it here.
  rawCaptions?: boolean;
}) {
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
      <div className="relative">
        <div
          ref={excerptRef}
          style={fade}
          className="border-border bg-muted/20 max-h-72 overflow-y-auto rounded-r-md border-l py-2 pr-3 pl-4"
        >
          <MarkdownPreview md={preview.content_md ?? ""} />
        </div>
        {rawCaptions && (
          <span className="bg-background text-muted-foreground border-border absolute top-2 right-4 rounded-full border px-2 py-0.5 text-[11px]">
            Raw captions
          </span>
        )}
      </div>
      {preview.truncated && (
        <p className="text-muted-foreground text-xs">
          Preview trimmed. The full text is used when compiling.
        </p>
      )}
    </div>
  );
}

interface RoleSelectorProps {
  llm: LlmConfig;
  // Opens the connect dialog. The panel always renders: with no model, this
  // takes the switch's place.
  onConnect: () => void;
  browserModel: StoredEndpoint | null;
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
// Always rendered: with no model available, "Connect a model" stands where the
// switch would be, quiet rather than gold, so the free path stays the default.
function RoleSelector({
  llm,
  onConnect,
  browserModel,
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

  const providerLabel = browserModel
    ? (llm.providers.find((p) => p.id === browserModel.provider)?.label ?? "your own server")
    : null;
  // What the switch does, never the problem again: the rows already say which
  // captions read raw. Its reach is a count, so you know what it would touch.
  const reach =
    unpunctuatedSelected > 0
      ? ` Applies to ${unpunctuatedSelected} source${unpunctuatedSelected !== 1 ? "s" : ""} with raw captions.`
      : "";
  const what = !llm.available
    ? "Your own AI model can punctuate and lightly copyedit the text. Without one, it stays exactly as retrieved."
    : masterOn
      ? `Adds missing punctuation and a light copyedit.${reach}`
      : `Punctuates raw captions into paragraphs and lightly copyedits.${reach}`;

  // A section of the pane like the others, not a card: a name and its switch,
  // one sentence, then the extras and whose model it runs on.
  return (
    <section aria-labelledby="ai-polish" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h3 id="ai-polish" className="text-sm font-medium">
          AI polish
        </h3>
        {llm.available && (
          <Switch checked={masterOn} onCheckedChange={setMaster} aria-labelledby="ai-polish" />
        )}
      </div>
      <p className="text-muted-foreground text-sm">{what}</p>

      {!llm.available ? (
        <Button type="button" variant="outline" size="sm" onClick={onConnect} className="self-start">
          Connect a model
        </Button>
      ) : (
        <>
          {masterOn && extraRoles.length > 0 && (
            <ul className="flex flex-col">
              {extraRoles.map((role) => (
                <li key={role.id}>
                  <label className="hover:bg-muted/50 -mx-2 flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors">
                    <Checkbox
                      checked={selectedRoles.has(role.id)}
                      onCheckedChange={() => onToggleRole(role.id)}
                      className="mt-0.5"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm leading-none font-medium">{role.label}</span>
                      <span className="text-muted-foreground text-xs">{role.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {/* Always a way to bring (or change) your own key from here, even
              when the server has a model of its own. */}
          <p className="text-muted-foreground text-xs">
            {providerLabel ? `Runs on your ${providerLabel} key. ` : ""}
            <button type="button" onClick={onConnect} className="text-foreground text-link font-medium">
              {providerLabel ? "Change" : "Use your own key"}
            </button>
          </p>
        </>
      )}
    </section>
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
function contentTag(
  item: DiscoveredItem,
  sttAvailable: boolean,
  sttPerMinute: number,
) {
  // Each tag says the consequence, not a technical state. Three tones: muted
  // when nothing needs doing, warning when the item is included but costs or
  // reads rough, destructive when it will be left out.
  if (item.item_type === "podcast" && item.has_transcript === true) {
    return <Tag>Transcript</Tag>;
  }
  if (item.item_type === "podcast") {
    if (!sttAvailable) {
      return (
        <Tag className="text-destructive">
          <Ban />
          No transcript, will be left out
        </Tag>
      );
    }
    const minutes = Math.round((item.estimated_duration_s ?? 0) / 60);
    const price = minutes * sttPerMinute;
    return (
      <Tag className="text-warning">
        <TriangleAlert />
        Transcribed from the audio
        {minutes > 0 && ` · ${minutes} min`}
        {price > 0 && ` · ~${price < 0.01 ? "< $0.01" : `$${price.toFixed(2)}`}`}
      </Tag>
    );
  }
  if (item.item_type === "blog") {
    return <Tag>Full article</Tag>;
  }
  if (item.has_transcript === false) {
    return (
      <Tag className="text-destructive">
        <Ban />
        No subtitles, will be left out
      </Tag>
    );
  }
  if (item.has_transcript == null) {
    return (
      <Tag className="text-warning">
        <CircleHelp />
        Subtitles not checked, may be left out
      </Tag>
    );
  }
  if (item.is_punctuated === false) {
    return (
      <Tag className="text-warning">
        <TriangleAlert />
        Auto captions, no punctuation
      </Tag>
    );
  }
  return <Tag>Transcript</Tag>;
}

// What was retrieved: a state, written as a plain muted note in sentence case.
// The small tracked capitals stay with the source's type (a category) in the
// group header, so the two never read as the same kind of label.
// Spreads its props (ref included) so it can be a tooltip's trigger.
function Tag({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 [&_svg]:size-3",
        className,
      )}
    />
  );
}

// A podcast episode with no published transcript found at discovery: its text
// will have to be made from the audio (metered) when compiling.
function needsTranscription(item: DiscoveredItem): boolean {
  return item.item_type === "podcast" && item.has_transcript !== true;
}

// An item the compile will skip whatever the user ticks: an episode with no
// transcript while no transcription is connected, or a video with no subtitles.
function isLeftOut(item: DiscoveredItem, sttMissing: boolean): boolean {
  if (needsTranscription(item)) return sttMissing;
  return item.item_type === "youtube" && item.has_transcript === false;
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
      if (stt_available && needsTranscription(it)) stt += minutes * pricing.stt_per_minute;
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
        <span className="font-medium">{totalLabel}</span>
        {parts.length > 1 && <span className="ml-1">({parts.join(" · ")})</span>}
      </span>
    </div>
  );
}

// The footer of a step that is working on its own: the primary action's place,
// saying what is happening.
function WaitingButton({ label }: { label: string }) {
  return (
    <Button type="button" disabled className="w-full">
      {label}
    </Button>
  );
}
