import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Ban,
  ChevronDown,
  CircleHelp,
  Eye,
  EyeOff,
  ExternalLink,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { highlightMatch } from "@/components/highlight";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { MetaSep, SourceFavicon } from "@/components/source-kind";
import { hostOf } from "@/lib/url";
import { cn } from "@/lib/utils";
import { MarkdownPreview } from "@/components/book";
import { useScrollFade } from "@/lib/use-scroll-fade";
import {
  currentLanguage,
  episodeCost,
  formatUsd,
  isRawCaptions,
  languageName,
  needsTranscription,
} from "@/lib/review";
import {
  fetchItemPreview,
  type DiscoveredItem,
  type ItemPreview,
  type LlmConfig,
} from "@/lib/api";
import { DragGrip } from "./shared";

export interface ReviewItemProps {
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
  // Reads the item in another of its caption languages (resolves once saved).
  onChooseLanguage: (language: string) => Promise<void>;
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
export function ReviewItem({
  jobId,
  item,
  checked,
  leftOut,
  onToggle,
  onConnectStt,
  onPolish,
  onChooseLanguage,
  pricing,
  sourceUrl,
  dragHandleProps,
  asSource,
  highlight,
  muted,
}: ReviewItemProps) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ItemPreview | null>(null);

  // The language the preview text is in. Opening the row, or switching its
  // language while open, loads the text; an answer for a language the row has
  // left meanwhile is dropped.
  const choice = item.transcript_choice ?? null;
  const [previewFor, setPreviewFor] = useState<string | null | undefined>(undefined);
  const [failure, setFailure] = useState<{ choice: string | null; message: string } | null>(null);
  const error = failure?.choice === choice ? failure.message : null;
  const loading = open && previewFor !== choice && error === null;

  useEffect(() => {
    if (!open || previewFor === choice) return;
    let current = true;
    fetchItemPreview(jobId, item.id)
      .then((next) => {
        if (!current) return;
        setPreview(next);
        setPreviewFor(choice);
      })
      .catch((err) => {
        if (current) setFailure({ choice, message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      current = false;
    };
  }, [open, choice, previewFor, jobId, item.id]);

  function toggleOpen() {
    setFailure(null); // reopening retries a preview that failed
    setOpen((was) => !was);
  }

  // The meta line is deliberately spare: the content tag (what was retrieved +
  // whether it needs work), and — only for a single-item source — its domain.
  // No length metrics: the decision here is "include or not / polish or not".
  // Length lives in the per-item preview and the cost estimate.
  const metaParts: ReactNode[] = [contentTag(item, leftOut, pricing ? episodeCost(item, pricing) : 0)];
  if (item.item_type === "youtube" && item.has_transcript && currentLanguage(item)) {
    metaParts.push(<LanguagePicker item={item} onChoose={onChooseLanguage} />);
  }
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
        {/* The original, one click away: so the user can check for themselves
            what a source really is (a paywall, a landing page, an empty shell)
            before trusting the tag or the preview. */}
        <Tooltip content="Open original">
          <Button
            variant="nav"
            size="icon-sm"
            aria-label={`Open original: ${item.title}`}
            className="ml-2 shrink-0"
            nativeButton={false}
            render={<a href={item.url} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink />
          </Button>
        </Tooltip>
        {noPreview ? (
          // Nothing to read before compiling: the slot stays so the column of
          // eyes keeps its line.
          <span aria-hidden="true" className="size-8 shrink-0" />
        ) : (
          <Tooltip content={open ? "Hide preview" : "Preview"}>
            <Button
              type="button"
              variant="nav"
              size="icon-sm"
              onClick={toggleOpen}
              aria-expanded={open}
              aria-label={open ? "Hide preview" : "Preview"}
              className="shrink-0"
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

// The language a video is read in. A menu when it can be read in another one
// (its spoken language, translations a channel added), plain text otherwise.
function LanguagePicker({
  item,
  onChoose,
}: {
  item: DiscoveredItem;
  onChoose: (language: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const tracks = item.transcript_tracks ?? [];
  const current = currentLanguage(item)!;
  if (tracks.length < 2) return <Tag>{languageName(current)}</Tag>;

  async function choose(language: string) {
    if (language === current || pending) return;
    setPending(language);
    setFailed(null);
    try {
      await onChoose(language);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  return (
    // Inside the row's label: a click here must not toggle the checkbox.
    <span className="inline-flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending !== null}
          aria-label={`Language: ${languageName(current)}. Change`}
          className="text-foreground hover:border-foreground/25 aria-expanded:border-foreground/25 border-border inline-flex items-center gap-1 rounded-full border py-px pr-1.5 pl-2 transition-colors disabled:opacity-60"
        >
          {pending && <Spinner className="size-3" />}
          {languageName(pending ?? current)}
          <ChevronDown className="text-muted-foreground size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-auto min-w-52">
          <DropdownMenuRadioGroup value={current} onValueChange={(v) => choose(String(v))}>
            {tracks.map((t) => (
              <DropdownMenuRadioItem key={t.language} value={t.language} closeOnClick className="py-1.5">
                {languageName(t.language)}
                {t.relation && (
                  <span className="text-muted-foreground text-xs">
                    · {t.relation === "dubbed" ? "AI dub" : t.relation}
                  </span>
                )}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {failed && <span className="text-destructive">{failed}</span>}
    </span>
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
  if (item.item_type === "blog" && item.paywalled) {
    return (
      <Tag className="text-destructive">
        <Ban />
        Paywalled, will be left out
      </Tag>
    );
  }
  if (item.item_type === "blog" && item.unreadable) {
    return (
      <Tag className="text-destructive">
        <Ban />
        No readable text, will be left out
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
