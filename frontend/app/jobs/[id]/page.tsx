"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Coins,
  Eye,
  EyeOff,
  GripVertical,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Logotype } from "@/components/brand";
import {
  MetaSep,
  SourceFavicon,
  SourceTypePill,
  hostOf,
  kindFromItemType,
} from "@/components/source-kind";
import { cn } from "@/lib/utils";
import {
  confirmJob,
  fetchItemPreview,
  fetchJob,
  fetchLlmConfig,
  getDownloadUrl,
  type DiscoveredItem,
  type ItemPreview,
  type JobResponse,
  type LlmConfig,
  type Source,
} from "@/lib/api";

const ACTIVE_STATUSES = ["pending", "discovering", "processing"];

// Softens the bottom edge of the scrollable item list: the last 2rem fade to
// transparent so content dissolves into the card instead of being sliced on a
// hard line (it also doubles as a "there's more below" affordance). The top edge
// is handled by the opaque sticky header + its own fade, so only the bottom is
// masked here.
const SCROLL_FADE: React.CSSProperties = {
  maskImage: "linear-gradient(to bottom, #000 calc(100% - 2rem), transparent)",
  WebkitMaskImage:
    "linear-gradient(to bottom, #000 calc(100% - 2rem), transparent)",
};

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

    async function poll(): Promise<boolean> {
      try {
        const data = await fetchJob(id);
        if (cancelled) return true;
        setJob(data);
        return !ACTIVE_STATUSES.includes(data.status);
      } catch (err) {
        if (cancelled) return true;
        setError(err instanceof Error ? err.message : String(err));
        return true;
      }
    }

    const interval = setInterval(async () => {
      if (await poll()) clearInterval(interval);
    }, 2000);
    poll().then((done) => done && clearInterval(interval));

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, pollKey]);

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
      setJob(updated);
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
          <Link href="/" className="flex items-center">
            <Logotype className="h-8 w-auto" title="Thothly" />
          </Link>
          <Link href="/" className="text-muted-foreground text-sm hover:underline">
            ← New compilation
          </Link>
        </header>

        {error && (
          <p className="text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-sm">
            {error}
          </p>
        )}

        <Card>
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
            <StatusMessage label="Compiling…" />
          ) : job.status === "completed" ? (
            <div className="flex flex-col items-start gap-6">
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium">Your compilation is ready 🎉</p>
                {job.book_title && (
                  <p className="text-muted-foreground text-sm">{job.book_title}</p>
                )}
              </div>
              <a
                href={getDownloadUrl(id)}
                download
                className={buttonVariants({ size: "lg" })}
              >
                Download EPUB
              </a>
              {job.output_md_path && <MarkdownActions jobId={id} />}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-destructive text-sm font-medium">
                Compilation failed.
              </p>
              {job.error && (
                <p className="text-muted-foreground font-mono text-xs">{job.error}</p>
              )}
            </div>
          )}
          </CardContent>
        </Card>
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

// The wait between staging sources and reviewing items. Rather than a bare
// spinner, it lists the sources being looked through (by their host/URL — real
// names aren't known until discovery finishes) so the auto-advance into review
// reads as one continuous motion instead of a dead loading screen.
function DiscoveringView({ sources }: { sources: Source[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 text-sm font-medium">
        <Spinner />
        Looking through your {sources.length} source
        {sources.length !== 1 ? "s" : ""}…
      </div>
      <ul className="flex flex-col gap-1.5">
        {sources.map((s, i) => (
          <li
            key={`${s.url}-${i}`}
            className="text-muted-foreground bg-muted/40 truncate rounded-lg px-3 py-2 text-xs"
          >
            {s.name?.trim() || sourceLabel(s.url)}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        Listing what each one contains. You pick what goes in next.
      </p>
    </div>
  );
}

// The completed screen's Markdown actions. The Markdown twin is meant to be fed
// to an AI, where copy-paste is usually the natural gesture, so we offer Copy
// (instant, from the text we fetch once) alongside Download, and surface the
// size so the user can judge whether it fits their model's context. We never
// gate by size: the right limit depends on the target LLM, so we inform rather
// than hide the action.
function MarkdownActions({ jobId }: { jobId: string }) {
  const [md, setMd] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
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
  }, [jobId]);

  const words = md ? countWords(md) : null;
  const tokens = words != null ? Math.round(words * TOKENS_PER_WORD) : null;

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
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <span className="font-medium">Markdown</span>
        <span className="text-muted-foreground">
          {" "}
          for an AI
          {words != null &&
            ` · ~${words.toLocaleString("en-US")} words (~${formatTokens(tokens!)} tokens)`}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={copy}
          disabled={!md}
        >
          {copied ? "Copied ✓" : "Copy"}
        </Button>
        <a
          href={getDownloadUrl(jobId, "md")}
          download
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Download
        </a>
      </div>
      {tokens != null && tokens > 200000 && (
        <p className="text-muted-foreground text-xs">
          Large for some AIs; downloading and attaching the file may work better.
        </p>
      )}
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
  // The bottom scroll-fade is only meaningful while content is hidden below the
  // fold; it's measured (not always-on) so a list that fits, or one scrolled to
  // the end, doesn't dim its last row for nothing.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

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

  // Track whether anything is still hidden below the fold so the bottom fade can
  // be shown only then. Re-measured on scroll, on resize, and whenever the
  // rendered content changes (filtering, collapsing, reordering).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () =>
      setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [visibleGroups, collapsed]);

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
        <div className="bg-card sticky top-0 z-10 flex items-center gap-3.5 px-3.5 py-2.5">
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
              className="from-card pointer-events-none absolute inset-x-0 top-full h-4 bg-gradient-to-b to-transparent"
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
        className="-mx-2 flex max-h-[55vh] flex-col overflow-y-auto"
        style={hasMoreBelow ? SCROLL_FADE : undefined}
      >
        {visibleGroups.length === 0 ? (
          <p className="text-muted-foreground px-3 py-8 text-center text-sm">
            No results for “{query}”.
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
          <Coins className="text-gold mt-px size-3.5 shrink-0" />
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
  if (!preview.available) {
    return (
      <p className="text-muted-foreground text-xs italic">
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
      <div className="border-border/60 bg-muted/20 max-h-72 overflow-y-auto rounded-r-md border-l-2 py-2 pr-3 pl-4">
        <MarkdownPreview md={preview.content_md ?? ""} />
      </div>
      {preview.truncated && (
        <p className="text-muted-foreground text-xs italic">
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
          className="bg-gold/10 text-gold flex size-7 shrink-0 items-center justify-center rounded-lg"
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
// (e.g. "youtube.com/@channel", "jakub.kr") — the fallback when no friendlier
// discovered name is available.
function sourceLabel(url: string | undefined): string {
  if (!url) return "Source";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
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
      <Badge variant="secondary" className="bg-gold/10 text-gold gap-1">
        <Coins />
        From audio
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
    return <Badge variant="secondary">Raw captions</Badge>;
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
