import type { ReactNode } from "react";
import { CircleHelp, Minus, Plus } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { MetaSep, SourceFavicon, SourceTypePill } from "@/components/source-kind";
import { hostOf, sourceName } from "@/lib/url";
import { kindFromItemType } from "@/lib/kinds";
import { cn, plural } from "@/lib/utils";
import { PODCAST_PRESELECT, isRawCaptions, needsTranscription, sureItems } from "@/lib/review";
import { type DiscoveredItem, type JobResponse, type LlmConfig } from "@/lib/api";
import { ReviewItem } from "./review-item";
import { DragGrip } from "./shared";

// A drag-sortable wrapper for one source group. Keyed by the source index; hands
// the drag listeners to its child so the grip in the header is the only handle
// (the rows themselves stay clickable). Lifts above its neighbours while held.
export function SortableSourceGroup({
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

export interface SourceGroupProps {
  sourceIndex: number;
  groupItems: DiscoveredItem[];
  // The drag listeners when reordering is on, else null.
  handleProps: Record<string, unknown> | null;
  jobId: string;
  sources: JobResponse["sources"];
  selected: Set<string>;
  // The active search term, lower-cased; empty when not filtering.
  needle: string;
  collapsed: Set<number>;
  uncertainOpen: Set<number>;
  llm: LlmConfig | null;
  sttAvailable: boolean;
  toggle: (itemId: string) => void;
  selectItems: (ids: string[], value: boolean) => void;
  toggleCollapse: (index: number) => void;
  toggleUncertain: (index: number) => void;
  leftOut: (item: DiscoveredItem) => boolean;
  connectStt?: () => void;
  turnOnPolish?: () => void;
  chooseLanguage: (itemId: string, language: string) => Promise<void>;
}

// One source group: its sticky header (optional drag handle, collapse, count,
// select toggle) and items. Shared by the sortable and plain render paths —
// `handleProps` is the drag listeners when reordering is on, else null.
export function SourceGroup({
  sourceIndex,
  groupItems,
  handleProps,
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
}: SourceGroupProps) {
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
  // When every item in the source is the same medium (a channel of videos, a
  // site of pages, a podcast of episodes), the per-row type pill
  // repeats what the group already is — so we show the kind ONCE in the header
  // and drop it from each row. A mixed group keeps its per-row pills.
  const media = new Set(groupItems.map((it) => it.item_type));
  const uniformKind = media.size === 1 ? kindFromItemType([...media][0]) : null;
  // The header reads like a source on the home page (a name in normal case,
  // its favicon + domain, its type), so the two screens speak the same visual
  // language. The domain is dropped when it would just echo the name.
  const source = sources[sourceIndex];
  const url = source?.url ?? "";
  const title = source ? sourceName(source) : "";
  const host = hostOf(url);
  // Show the domain in the meta line unless the title already fell back to the
  // URL (no captured name), so it's never printed twice.
  // An audio source has no domain worth showing (see domainOf).
  const showHost =
    host !== "" && !title.startsWith(host) && uniformKind?.medium !== "audio";

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
        onChooseLanguage={(language) => chooseLanguage(only.id, language)}
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
  const groupAction =
    connectStt && groupItems.some(needsTranscription)
      ? { label: "Connect transcription", run: connectStt }
      : turnOnPolish && groupItems.some(isRawCaptions)
        ? { label: "Fix with AI polish", run: turnOnPolish }
        : null;
  const renderChild = (item: DiscoveredItem) => (
    <ReviewItem
      key={item.id}
      jobId={jobId}
      item={item}
      checked={selected.has(item.id)}
      leftOut={leftOut(item)}
      onToggle={() => toggle(item.id)}
      onConnectStt={groupAction ? undefined : connectStt}
        onPolish={groupAction ? undefined : turnOnPolish}
        onChooseLanguage={(language) => chooseLanguage(item.id, language)}
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
                ? "Deselect all chapters in this source"
                : "Select all chapters in this source"
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
                {selectedCount} of {headerItems.length}
              </span>
            </span>
          </button>
          {/* The fix for its rows, said once on the source instead of on
              every episode or video of a long list. */}
          {groupAction && (
            <button
              type="button"
              onClick={groupAction.run}
              className="text-foreground text-link shrink-0 text-xs font-medium"
            >
              {groupAction.label}
            </button>
          )}
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
                      {unsureSelected} of {unsureItems.length}
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
}
