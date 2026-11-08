import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { EnterKey, Kbd, ModKey } from "@/components/ui/kbd";
import { useShortcut } from "@/lib/shortcuts";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CompilationPane, WorkPane } from "@/components/compilation-pane";
import { ConnectModelStep, type ModelKind } from "@/components/connect-model";
import { useStoredModels } from "@/lib/use-stored-models";
import {
  costLabel,
  estimateCost,
  isLeftOut,
  isPolishOn,
  isPolishable,
  isRawCaptions,
  polishRoleIds,
  sureItems,
  toggled,
} from "@/lib/review";
import {
  chooseItemLanguage,
  type DiscoveredItem,
  type JobResponse,
  type LlmConfig,
} from "@/lib/api";
import { CoverEditor } from "./cover";
import { BackToSources } from "./shared";
import { useReview } from "./use-review";
import { CostEstimate, RoleSelector } from "./review-polish";
import { SortableSourceGroup, SourceGroup } from "./source-group";

export function ReviewView({
  job,
  llm,
  onConfirmed,
  onItemChange,
}: {
  job: JobResponse;
  llm: LlmConfig | null;
  onConfirmed: (job: JobResponse) => void;
  // A row changed on the server (its caption language).
  onItemChange: (item: DiscoveredItem) => void;
}) {
  const jobId = job.id;
  const items = job.discovered_items;
  // Language switches in flight: Compile waits for them, or it would build
  // the language the row is leaving.
  const [switching, setSwitching] = useState(0);
  const chooseLanguage = async (itemId: string, language: string) => {
    setSwitching((n) => n + 1);
    try {
      onItemChange(await chooseItemLanguage(jobId, itemId, language));
    } finally {
      setSwitching((n) => n - 1);
    }
  };
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
    cover,
    setCover,
    coverImage,
    setCoverImage,
    confirm,
  } = useReview(job, onConfirmed);
  const [query, setQuery] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
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
  useShortcut(
    "mod+enter",
    () => void confirm(),
    !confirming && switching === 0 && !coverUploading && includedCount > 0 && title.trim() !== "",
  );
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

  // What the cover's emblem and default authors are read from: the items that
  // will actually be compiled, in a stable order.
  const coverSelection = useMemo(
    () => items.filter((it) => selected.has(it.id) && !leftOut(it)).map((it) => it.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- leftOut only moves with sttMissing
    [items, selected, sttMissing],
  );

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

  // What every source group needs from the screen, beyond its own items.
  const groupProps = {
    jobId,
    sources,
    selected,
    needle,
    collapsed,
    uncertainOpen,
    llm,
    sttAvailable,
    toggle,
    selectItems,
    toggleCollapse,
    toggleUncertain,
    leftOut,
    connectStt,
    turnOnPolish,
    chooseLanguage,
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
                  {(handleProps) => (
                    <SourceGroup
                      {...groupProps}
                      sourceIndex={sourceIndex}
                      groupItems={groupItems}
                      handleProps={handleProps}
                    />
                  )}
                </SortableSourceGroup>
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          visibleGroups.map(({ sourceIndex, groupItems }) => (
            <div key={sourceIndex} className="flex flex-col">
              <SourceGroup
                {...groupProps}
                sourceIndex={sourceIndex}
                groupItems={groupItems}
                handleProps={null}
              />
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
        notice={error && <Notice variant="error">{error}</Notice>}
        footer={
          <>
            {includedCount > 0 && <CostEstimate cost={cost} />}
            {/* The button says what's blocking it (no item / no title), so
                the message is where the click is. */}
            <Button
              onClick={confirm}
              disabled={confirming || switching > 0 || coverUploading || includedCount === 0 || title.trim() === ""}
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
        {!connecting && (
          <CoverEditor
            jobId={jobId}
            title={title}
            selectedIds={coverSelection}
            cover={cover}
            onCoverChange={setCover}
            hasImage={coverImage}
            onHasImageChange={setCoverImage}
            onUploadingChange={setCoverUploading}
          />
        )}
      </CompilationPane>

    </>
  );
}
