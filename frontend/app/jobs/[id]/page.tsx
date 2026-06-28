"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Logotype } from "@/components/brand";
import {
  MetaSep,
  SourceMetric,
  SourceTypePill,
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
    const isCollapsed = collapsed.has(sourceIndex);
    return (
      <>
        <div className="bg-card/95 sticky top-0 z-10 flex items-center gap-2 px-3 py-2 backdrop-blur-sm">
          {handleProps && (
            <button
              type="button"
              aria-label="Drag to reorder source"
              className="text-muted-foreground/50 hover:text-foreground -ml-1 shrink-0 cursor-grab touch-none transition-colors active:cursor-grabbing"
              {...(handleProps as ButtonHTMLAttributes<HTMLButtonElement>)}
            >
              <GripVertical className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => toggleCollapse(sourceIndex)}
            className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1.5 transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="size-4 shrink-0" />
            ) : (
              <ChevronDown className="size-4 shrink-0" />
            )}
            <span className="truncate text-xs font-semibold tracking-wide uppercase">
              {groupLabel(sources[sourceIndex], groupItems)}
            </span>
            <span className="text-muted-foreground/70 shrink-0 text-xs normal-case">
              {selectedCount}/{groupItems.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSelectItems(ids, !allSelected)}
            className="text-muted-foreground hover:text-foreground shrink-0 text-xs hover:underline"
          >
            {allSelected ? "Deselect" : "Select"}
          </button>
        </div>
        {!isCollapsed &&
          groupItems.map((item) => (
            <ReviewItem
              key={item.id}
              jobId={jobId}
              item={item}
              checked={selected.has(item.id)}
              onToggle={() => onToggle(item.id)}
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
            Book title
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
        {title.trim() === "" && (
          <p className="text-muted-foreground/70 text-xs">
            A title is required to generate.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {items.length} item{items.length !== 1 ? "s" : ""}, {selected.size}{" "}
          selected
        </p>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="xs" onClick={onSelectAll}>
            Select all
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={onSelectNone}>
            Deselect all
          </Button>
        </div>
      </div>

      {items.length > 8 && (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles…"
        />
      )}

      <div className="-mx-2 flex max-h-[55vh] flex-col overflow-y-auto">
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

      {llm && llm.available && llm.roles.length > 0 && (
        <RoleSelector
          llm={llm}
          selectedRoles={selectedRoles}
          onToggleRole={onToggleRole}
          unpunctuatedSelected={unpunctuatedSelected}
        />
      )}

      {selected.size > 0 && <CostEstimate cost={cost} />}

      <Button
        size="lg"
        onClick={onConfirm}
        disabled={confirming || selected.size === 0 || title.trim() === ""}
        className="w-full"
      >
        {confirming ? "Starting…" : "Generate"}
      </Button>
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
}

// One review row: the selection checkbox + metadata, plus an on-demand preview
// of the exact no-LLM content this item would contribute (so you can see what
// you're keeping before compiling). The preview is fetched lazily on first
// expand and then cached locally.
function ReviewItem({ jobId, item, checked, onToggle }: ReviewItemProps) {
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

  const status = statusBadge(item);
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
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5">
          <Checkbox checked={checked} onCheckedChange={onToggle} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-sm">{item.title}</span>
            <span className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs sm:flex-nowrap sm:overflow-hidden">
              <SourceTypePill
                kind={kindFromItemType(item.item_type)}
                className="shrink-0"
              />
              {item.reading_time_min != null && (
                <>
                  <MetaSep />
                  <SourceMetric kind="reading" className="shrink-0">
                    ~{item.reading_time_min} min read
                  </SourceMetric>
                </>
              )}
              {durationLabel(item) && (
                <>
                  <MetaSep />
                  <SourceMetric kind="duration" className="shrink-0">
                    {durationLabel(item)}
                  </SourceMetric>
                </>
              )}
              {extraMeta(item).map((part) => (
                <Fragment key={part}>
                  <MetaSep />
                  <span className="min-w-0 truncate">{part}</span>
                </Fragment>
              ))}
              {status && (
                <>
                  <MetaSep />
                  {status}
                </>
              )}
            </span>
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
      <div className="bg-muted/40 max-h-72 overflow-y-auto rounded-lg border p-3">
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
    <div className="flex flex-col gap-2 text-sm leading-relaxed">
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
  unpunctuatedSelected: number;
}

// AI cleanup is secondary to the free path, so it lives in a disclosure that's
// collapsed by default — the summary still surfaces how many videos would
// benefit so the user knows there's something relevant inside. Only rendered
// when an LLM is actually configured (the caller gates on llm.available), so
// there's no disabled state to handle here.
function RoleSelector({
  llm,
  selectedRoles,
  onToggleRole,
  unpunctuatedSelected,
}: RoleSelectorProps) {
  const [open, setOpen] = useState(false);
  const activeCount = selectedRoles.size;
  const summary =
    activeCount > 0
      ? `${activeCount} on`
      : unpunctuatedSelected > 0
        ? `${unpunctuatedSelected} could be cleaned up`
        : "Optional";

  return (
    <div className="rounded-xl border border-dashed">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        )}
        <span className="flex-1 text-sm font-medium">AI cleanup</span>
        <span className="text-muted-foreground text-xs">{summary}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 px-4 pb-4 pl-10">
          <p className="text-muted-foreground text-xs">
            {unpunctuatedSelected > 0
              ? `${unpunctuatedSelected} unpunctuated video${unpunctuatedSelected !== 1 ? "s" : ""} in the selection. Punctuation will make them readable.`
              : "Improves the selected transcripts. No cost on the default path."}
          </p>
          <ul className="flex flex-col gap-2.5">
            {llm.roles.map((role) => (
              <li key={role.id}>
                <label className="flex cursor-pointer items-start gap-3">
                  <Checkbox
                    checked={selectedRoles.has(role.id)}
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
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// The label for a source group. Prefers the real name the backend captured at
// discovery (channel / playlist / blog title); falls back to a compact
// URL-derived label. A single-item source names itself after its one item (a
// lone video's "source name" is the video title), so there we use the URL
// instead of printing the same text as both the group header and the item.
function groupLabel(
  source: Source | undefined,
  items: DiscoveredItem[],
): string {
  const name = source?.name?.trim();
  if (name && !(items.length === 1 && items[0].title.trim() === name)) {
    return name;
  }
  return sourceLabel(source?.url);
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

// Play time (video/podcast) as M:SS. Rendered with a clock by SourceMetric so it
// never reads as reading time — the same convention the search screen sets.
function durationLabel(item: DiscoveredItem): string | null {
  if (item.estimated_duration_s == null) return null;
  const m = Math.floor(item.estimated_duration_s / 60);
  const s = item.estimated_duration_s % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// The textual extras shown after the icon-led metrics: the transcript word count
// and language. The blog char-count reflected the RSS summary (often truncated),
// so it stays hidden.
function extraMeta(item: DiscoveredItem): string[] {
  const parts: string[] = [];
  if (item.word_count != null) {
    parts.push(`${item.word_count.toLocaleString("en-US")} words`);
  }
  if (item.transcript_lang) {
    parts.push(item.transcript_lang.toUpperCase());
  }
  return parts;
}

// Per-video readiness, shown so the user knows before compiling whether a
// transcript reads cleanly, will need an LLM cleanup, or is missing entirely.
function statusBadge(item: DiscoveredItem) {
  if (item.item_type !== "youtube") return null;

  if (item.has_transcript === false) {
    return <Badge variant="destructive">⛔ No subtitles</Badge>;
  }
  if (item.has_transcript == null) {
    return <Badge variant="secondary">❓ Subtitles unchecked</Badge>;
  }
  if (item.is_punctuated) {
    return <Badge variant="success">✅ Punctuated</Badge>;
  }
  return <Badge variant="warning">⚠️ LLM cleanup</Badge>;
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
      // Auto-punctuation runs on raw captions (or whenever ticked).
      if (it.is_punctuated === false || hasPunctuate) llmCost += pass(words);
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
  if (total <= 0) return null;

  const parts: string[] = [];
  if (cost.stt > 0) parts.push(`transcription ${formatUsd(cost.stt)}`);
  if (cost.llm > 0) parts.push(`AI cleanup ${formatUsd(cost.llm)}`);

  const totalLabel = total < 0.01 ? "< $0.01" : `~$${total.toFixed(2)}`;

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
