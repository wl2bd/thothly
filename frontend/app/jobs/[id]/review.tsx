import {
  Fragment,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Ban,
  CircleHelp,
  Eye,
  EyeOff,
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

import { EnterKey, Kbd, ModKey } from "@/components/ui/kbd";
import { useShortcut } from "@/lib/shortcuts";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { highlightMatch } from "@/components/highlight";
import { Notice } from "@/components/ui/notice";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { CompilationPane, WorkPane } from "@/components/compilation-pane";
import { MetaSep, SourceFavicon, SourceTypePill } from "@/components/source-kind";
import { hostOf, sourceName } from "@/lib/url";
import { kindFromItemType } from "@/lib/kinds";
import { ConnectModelStep, type ModelKind } from "@/components/connect-model";
import { providerLabel, toVisitorEndpoint, type StoredEndpoint } from "@/lib/model-keys";
import { useStoredModels } from "@/lib/use-stored-models";
import { cn, plural } from "@/lib/utils";
import { MarkdownPreview } from "@/components/book";
import { useScrollFade } from "@/lib/use-scroll-fade";
import {
  autoTitleForSelection,
  costLabel,
  defaultSelection,
  episodeCost,
  estimateCost,
  formatUsd,
  isLeftOut,
  isPolishOn,
  isPolishable,
  isRawCaptions,
  needsTranscription,
  orderedSelection,
  polishRoleIds,
  sureItems,
  toggled,
  withIds,
  type Cost,
  PODCAST_PRESELECT,
} from "@/lib/review";
import {
  confirmJob,
  fetchItemPreview,
  type DiscoveredItem,
  type ItemPreview,
  type JobResponse,
  type LlmConfig,
} from "@/lib/api";
import { BackToSources, DragGrip } from "./shared";


// The review step's state: what is selected, the book's name, the AI polish
// roles, the compile order of the sources, and the confirm that starts the
// compile. It mounts only while the job is in review, so it starts from the job.
function useReview(
  job: JobResponse,
  onConfirmed: (job: JobResponse) => void,
) {
  const [initial] = useState(() => defaultSelection(job.discovered_items));
  const [selected, setSelected] = useState(initial);
  // A title typed in the workspace is the user's own: keep it, frozen.
  const named = !!(job.title_named && job.book_title);
  const [title, setTitle] = useState(() =>
    named ? (job.book_title ?? "") : (autoTitleForSelection(job, initial) ?? ""),
  );
  // While auto, the title tracks the selection; the first manual edit freezes it.
  const [titleIsAuto, setTitleIsAuto] = useState(!named);
  const [titleSyncedFor, setTitleSyncedFor] = useState<Set<string>>(initial);
  const [roles, setRoles] = useState<Set<string>>(new Set());
  // Source indices in display order, drag-reorderable; they compile in this order.
  const [sourceOrder, setSourceOrder] = useState(() =>
    [...new Set(job.discovered_items.map((it) => it.source_index))].sort((a, b) => a - b),
  );
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storedModels = useStoredModels();

  // Adjust state during render (no effect): deselecting a whole source drops the
  // count, leaving a single source swaps to its name.
  if (titleIsAuto && selected !== titleSyncedFor) {
    setTitleSyncedFor(selected);
    const next = autoTitleForSelection(job, selected);
    if (next !== null) setTitle(next);
  }

  const onTitleChange = useCallback((value: string) => {
    setTitle(value);
    setTitleIsAuto(false);
  }, []);

  const selectItems = useCallback(
    (ids: string[], value: boolean) => setSelected((prev) => withIds(prev, ids, value)),
    [],
  );
  const toggle = useCallback((itemId: string) => setSelected((prev) => toggled(prev, itemId)), []);
  const toggleRole = useCallback((roleId: string) => setRoles((prev) => toggled(prev, roleId)), []);

  // The AI polish master switch turns its whole safe set on, or clears every
  // opt-in pass off, in one move.
  const setRolesMany = useCallback(
    (ids: string[], value: boolean) => setRoles((prev) => withIds(prev, ids, value)),
    [],
  );

  const selectAll = () =>
    setSelected(new Set(sureItems(job.discovered_items).map((it) => it.id)));
  const selectNone = () => setSelected(new Set());

  async function confirm() {
    setConfirming(true);
    setError(null);
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
        job.id,
        orderedSelection(job.discovered_items, sourceOrder, selected),
        title.trim() || undefined,
        [...roles],
        visitor,
      );
      onConfirmed(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  }

  return {
    selected,
    title,
    roles,
    sourceOrder,
    confirming,
    error,
    onTitleChange,
    toggle,
    selectItems,
    selectAll,
    selectNone,
    toggleRole,
    setRolesMany,
    setSourceOrder,
    confirm,
  };
}

export function ReviewView({
  job,
  llm,
  onConfirmed,
}: {
  job: JobResponse;
  llm: LlmConfig | null;
  onConfirmed: (job: JobResponse) => void;
}) {
  const jobId = job.id;
  const items = job.discovered_items;
  const sources = job.sources;
  const {
    selected,
    title,
    roles,
    sourceOrder,
    confirming,
    error,
    onTitleChange,
    toggle,
    selectItems,
    selectAll,
    selectNone,
    toggleRole,
    setRolesMany,
    setSourceOrder,
    confirm,
  } = useReview(job, onConfirmed);
  const [query, setQuery] = useState("");
  const [connecting, setConnecting] = useState<ModelKind | null>(null);
  const masterItems = sureItems(items);
  const masterSelected = masterItems.filter((it) => selected.has(it.id)).length;
  const allMaster = masterItems.length > 0 && masterSelected === masterItems.length;
  useShortcut("a", () => (allMaster ? selectNone() : selectAll()), items.length > 0);
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
      setSourceOrder(arrayMove(sourceOrder, from, to));
    }
  }

  const unpunctuatedSelected = items.filter(
    (it) => selected.has(it.id) && isRawCaptions(it),
  ).length;

  // Transcription availability gates the one unavoidable per-item cost: a
  // podcast's tag only wears the metered accent when STT can actually run, and
  // the legend under the list only appears when such an item is present.
  const sttAvailable = !!llm?.stt_available;
  // An item the compile can't read (an episode with no transcript and no
  // transcription, a video with no subtitles) shows unchecked and greyed on its
  // own row. It stays in `selected`, so connecting transcription brings it back.
  const sttMissing = !!llm && !sttAvailable;
  const leftOut = (it: DiscoveredItem) => isLeftOut(it, sttMissing);
  const includedCount = items.filter(
    (it) => selected.has(it.id) && !leftOut(it),
  ).length;
  // Mod+Enter compiles (from the title field too).
  useShortcut("mod+enter", () => void confirm(), !confirming && includedCount > 0 && title.trim() !== "");
  const connectStt = llm && !sttAvailable ? () => setConnecting("stt") : undefined;
  // Raw-caption rows offer AI polish themselves, while it's available and off.
  const polishDefaultIds = polishRoleIds(llm);
  const turnOnPolish =
    llm?.available && !isPolishOn(llm, roles) && polishDefaultIds.length > 0
      ? () => setRolesMany(polishDefaultIds, true)
      : undefined;

  // On an all-podcast selection the AI polish block is irrelevant and hidden.
  const polishableSelected = items.filter(
    (it) => selected.has(it.id) && isPolishable(it),
  ).length;

  const cost = useMemo(
    () => estimateCost(items, selected, roles, llm),
    [items, selected, roles, llm],
  );

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? items.filter((it) => it.title.toLowerCase().includes(needle))
        : items,
    [items, needle],
  );

  const groupMap = useMemo(() => {
    const map = new Map<number, DiscoveredItem[]>();
    for (const it of filtered) {
      const bucket = map.get(it.source_index);
      if (bucket) bucket.push(it);
      else map.set(it.source_index, [it]);
    }
    return map;
  }, [filtered]);

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

  const toggleUncertain = (index: number) => setUncertainOpen((prev) => toggled(prev, index));
  const toggleCollapse = (index: number) => setCollapsed((prev) => toggled(prev, index));

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
    const surePicks = groupItems.filter((it) => !it.uncertain);
    const unsureItems = groupItems.filter((it) => it.uncertain);
    const headerItems = sureItems(groupItems);
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
    // The header reads like a source on the home page (a name in normal case,
    // its favicon + domain, its type), so the two screens speak the same visual
    // language. The domain is dropped when it would just echo the name.
    const source = sources[sourceIndex];
    const url = source?.url ?? "";
    const title = source ? sourceName(source) : "";
    const host = hostOf(url);
    // Show the domain in the meta line unless the title already fell back to the
    // URL (no captured name), so it's never printed twice.
    const showHost = host !== "" && !title.startsWith(host);

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
          onToggle={() => toggle(only.id)}
          onConnectStt={connectStt}
          onPolish={turnOnPolish}
          pricing={llm?.pricing ?? null}
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
        onToggle={() => toggle(item.id)}
        onConnectStt={connectStt}
          onPolish={turnOnPolish}
          pricing={llm?.pricing ?? null}
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
            {handleProps && <DragGrip handleProps={handleProps} />}
            {/* Selection lives on the LEFT for every row. On a group it's a
                tri-state toggle for all the source's items (a dash when only some
                are picked), mirroring the per-item checkboxes beneath it. */}
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onCheckedChange={() => selectItems(ids, !allSelected)}
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
            {surePicks.map(renderChild)}
            {surePicks.length > 0 && unsureItems.length > 0 && (
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
                      selectItems(
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
                      {plural(unsureItems.length, "uncertain link")}
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
            {surePicks.length === 0 && unsureItems.map(renderChild)}
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
            allMaster ? selectNone() : selectAll()
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
              onClick={confirm}
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
                    : costLabel(cost)
                      ? `Compile · ${costLabel(cost)}`
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
            selectedRoles={roles}
            onToggleRole={toggleRole}
            onSetRolesMany={setRolesMany}
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
  leftOut: boolean;
  onToggle: () => void;
  // Set when an episode here can't be read without transcription and none is
  // connected: the row then offers the fix itself.
  onConnectStt?: () => void;
  // Set while AI polish is available and off: a raw-caption row offers it.
  onPolish?: () => void;
  // Null until the model config has loaded; a metered episode shows its cost from it.
  pricing: LlmConfig["pricing"] | null;
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
// of the exact no-LLM content this item would contribute.
function ReviewItem({
  jobId,
  item,
  checked,
  leftOut,
  onToggle,
  onConnectStt,
  onPolish,
  pricing,
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
  // No length metrics: the decision here is "include or not / polish or not".
  // Length lives in the per-item preview and the cost estimate.
  const metaParts: ReactNode[] = [contentTag(item, leftOut, pricing ? episodeCost(item, pricing) : 0)];
  // The fix sits on the row it fixes, so the problem and its way out read together.
  const action =
    onConnectStt && needsTranscription(item)
      ? { label: "Connect transcription", run: onConnectStt }
      : onPolish && isRawCaptions(item)
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
        {dragHandleProps && <DragGrip handleProps={dragHandleProps} />}
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
              rawCaptions={isRawCaptions(item)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function PreviewBody({
  preview,
  rawCaptions,
}: {
  preview: ItemPreview;
  // Raw auto-captions: the excerpt is labelled as such in its corner, so it's
  // never taken for the final text. The row above already says why and offers
  // the fix, so no sentence repeats it here.
  rawCaptions: boolean;
}) {
  // The excerpt box has no sticky header, so it fades on BOTH edges that hide
  // content — the same softening the lists get, so a long preview dissolves at
  // top and bottom instead of being sliced on a hard line.
  const excerptRef = useRef<HTMLDivElement>(null);
  const fade = useScrollFade(excerptRef, {}, [
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
// the default set (the roles whose tier is "default": punctuation and a copyedit
// pass), off clears every optional pass. The extras that invent structure or
// generate text (sections, preface) appear under the switch once it is on,
// opt-in one by one.
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
  const defaultIds = polishRoleIds(llm);
  const extraRoles = llm.roles.filter((r) => r.tier === "extra");
  const extraIds = extraRoles.map((r) => r.id);

  const masterOn = isPolishOn(llm, selectedRoles);

  function setMaster(on: boolean) {
    if (on) onSetRolesMany(defaultIds, true);
    else onSetRolesMany([...defaultIds, ...extraIds], false);
  }

  const runsOn = browserModel
    ? browserModel.provider === "custom"
      ? "Runs on your own server. "
      : `Runs on your ${providerLabel(llm, browserModel.provider)} key. `
    : "";
  // What the switch does, never the problem again: the rows already say which
  // captions read raw. Its reach is a count, so you know what it would touch.
  const reach =
    unpunctuatedSelected > 0
      ? ` Applies to ${plural(unpunctuatedSelected, "source")} with raw captions.`
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
            {runsOn}
            <button type="button" onClick={onConnect} className="text-foreground text-link font-medium">
              {browserModel ? "Change" : "Use your own key"}
            </button>
          </p>
        </>
      )}
    </section>
  );
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
// transcribed (metered STT), so while it is included its tag is a warning that
// carries the price (`price`, from episodeCost): this one costs to include no
// matter what, while everything else is free unless AI polish is on. `leftOut`
// comes from the same rule as the row's checkbox (isLeftOut).
function contentTag(item: DiscoveredItem, leftOut: boolean, price: number) {
  // Each tag says the consequence, not a technical state. Three tones: muted
  // when nothing needs doing, warning when the item is included but costs or
  // reads rough, destructive when it will be left out.
  if (item.item_type === "podcast" && item.has_transcript === true) {
    return <Tag>Transcript</Tag>;
  }
  if (item.item_type === "podcast") {
    if (leftOut) {
      return (
        <Tag className="text-destructive">
          <Ban />
          No transcript, will be left out
        </Tag>
      );
    }
    const minutes = Math.round((item.estimated_duration_s ?? 0) / 60);
    return (
      <Tag className="text-warning">
        <TriangleAlert />
        Transcribed from the audio
        {minutes > 0 && ` · ${minutes} min`}
        {price > 0 && ` · ${formatUsd(price, { approx: true })}`}
      </Tag>
    );
  }
  if (item.item_type === "blog") {
    return <Tag>Full article</Tag>;
  }
  if (leftOut) {
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

function CostEstimate({ cost }: { cost: Cost }) {
  const parts: string[] = [];
  if (cost.stt > 0) parts.push(`Transcription ${formatUsd(cost.stt)}`);
  if (cost.llm > 0) parts.push(`AI polish ${formatUsd(cost.llm)}`);

  // "Free" is the headline, not a blank line: when nothing is metered, say so.
  // It's the zero-LLM promise paying off, worth affirming at the decision point.
  // A metered total wears the warning tone, with what it pays for under it.
  const label = costLabel(cost);

  return (
    <div className="text-muted-foreground flex flex-col gap-0.5 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span>Estimated cost</span>
        <span className={cn("font-medium tabular-nums", label && "text-warning")}>
          {label ?? "Free"}
        </span>
      </div>
      {label && (
        <span className="text-right tabular-nums">{parts.join(" · ")}</span>
      )}
    </div>
  );
}
