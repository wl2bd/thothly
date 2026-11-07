// The review screen's rules, apart from how they are drawn: what starts
// selected, what the book is called, what will be left out, what it will cost.
import {
  BOOK_TITLE_MAX,
  type CompileState,
  type DiscoveredItem,
  type JobResponse,
  type LlmConfig,
  type RoleId,
} from "./api.ts";
import { plural } from "./utils.ts";

// Podcast episodes are the one item whose compile has a real cost (each is
// transcribed, billed per minute), and a whole feed can list hundreds. Only the
// first of each source start selected.
export const PODCAST_PRESELECT = 10;

// A homepage link discovery wasn't sure about (a mention in the page's prose)
// and an item the triage doubts start unselected: listed so the visitor can
// pick them, not assumed. "Newest" is feed order, newest first in practice.
export function defaultSelection(items: DiscoveredItem[]): Set<string> {
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

// What "all" means, for the whole list and for one source: the items discovery
// is sure of. Uncertain links are picked from their own fold; a list of nothing
// but uncertain links falls back to all of them.
export function sureItems(items: DiscoveredItem[]): DiscoveredItem[] {
  const sure = items.filter((it) => !it.uncertain);
  return sure.length > 0 ? sure : items;
}

// The editable default name, tracking the selection while it is still auto: a
// lone selected source lends its own name, several read "Compilation of N
// sources". Null when nothing is selected.
export function autoTitleForSelection(job: JobResponse, selected: Set<string>): string | null {
  const sources = [
    ...new Set(job.discovered_items.filter((it) => selected.has(it.id)).map((it) => it.source_index)),
  ];
  if (sources.length === 0) return null;
  if (sources.length === 1) {
    const src = job.sources[sources[0]];
    // A URL is a label, not a book title.
    const name = src?.name?.trim() || src?.title?.trim();
    if (name) return name.slice(0, BOOK_TITLE_MAX);
  }
  return `Compilation of ${plural(sources.length, "source")}`.slice(0, BOOK_TITLE_MAX);
}

// The selected ids in the visitor's source order, then item order within a
// source: the order the book's chapters come in.
export function orderedSelection(
  items: DiscoveredItem[],
  sourceOrder: number[],
  selected: Set<string>,
): string[] {
  return sourceOrder.flatMap((sourceIndex) =>
    items
      .filter((it) => it.source_index === sourceIndex && selected.has(it.id))
      .sort((a, b) => a.item_index - b.item_index)
      .map((it) => it.id),
  );
}

// A video whose captions came without punctuation: readable as is, rough
// without AI polish.
// A language in its own name ("fr" -> "Français"), as a reader of it would
// look for it. Falls back to the code when the browser doesn't know it.
export function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : code;
  } catch {
    return code;
  }
}

// The language a video is read in now, as a base code: the reader's choice,
// else the default track. Null when discovery couldn't read it.
export function currentLanguage(item: DiscoveredItem): string | null {
  const code = item.transcript_choice ?? item.transcript_tracks?.[0]?.language ?? item.transcript_lang;
  return code ? code.split("-")[0].toLowerCase() : null;
}

export function isRawCaptions(item: DiscoveredItem): boolean {
  return item.item_type === "youtube" && item.has_transcript === true && item.is_punctuated === false;
}

// An episode with no published transcript: its text has to be made from the
// audio (metered) when compiling.
export function needsTranscription(item: DiscoveredItem): boolean {
  return item.item_type === "podcast" && item.has_transcript !== true;
}

// An item the compile will skip whatever is ticked: an episode with no
// transcript while no transcription is connected, or a video with no subtitles.
export function isLeftOut(item: DiscoveredItem, sttMissing: boolean): boolean {
  if (needsTranscription(item)) return sttMissing;
  return item.item_type === "youtube" && item.has_transcript === false;
}

// The compile has reached a verdict on the item: built, left out or failed.
export function isFinished(state: CompileState | null | undefined): boolean {
  return state === "done" || state === "skipped" || state === "failed";
}

// The compile ran past the item without a chapter from it.
export function isLeftOutState(state: CompileState | null | undefined): boolean {
  return state === "skipped" || state === "failed";
}

// AI polish acts on captions and articles; episodes keep their diarized text.
export function isPolishable(item: DiscoveredItem): boolean {
  return item.item_type === "youtube" || item.item_type === "blog";
}

// The roles the AI polish switch turns on, and whether it is on.
export function polishRoleIds(llm: LlmConfig | null): string[] {
  return (llm?.roles ?? []).filter((r) => r.tier === "default").map((r) => r.id);
}

export function isPolishOn(llm: LlmConfig | null, roles: Set<string>): boolean {
  const ids = polishRoleIds(llm);
  return ids.length > 0 && ids.every((id) => roles.has(id));
}

// ── Cost estimate ────────────────────────────────────────────────────────────
// A ballpark of the metered calls the compile will make: an episode without a
// transcript is transcribed, and each item role is one pass over a text, which
// comes out about as long as it went in.

export const TOKENS_PER_WORD = 1.33;
const CHARS_PER_WORD = 6;

export interface Cost {
  stt: number;
  llm: number;
}

// What transcribing one episode costs, by its exact length: zero for anything
// that already has text. The row's tag and the total both read it.
export function episodeCost(item: DiscoveredItem, pricing: LlmConfig["pricing"]): number {
  if (!needsTranscription(item)) return 0;
  return ((item.estimated_duration_s ?? 0) / 60) * pricing.stt_per_minute;
}

// Which items each role makes a metered pass over. Keyed by every role id, so a
// role added or renamed on the backend fails the type check here.
const ROLE_PASSES: Record<RoleId, (item: DiscoveredItem) => boolean> = {
  punctuate: isRawCaptions,
  copyedit: () => true,
  // Counted on every item: chapters make it a no-op on a video, but the review
  // doesn't know which videos have chapters.
  sections: () => true,
  // One short call on the chapter titles, too small to show.
  preface: () => false,
};

export function estimateCost(
  items: DiscoveredItem[],
  selected: Set<string>,
  roles: Set<string>,
  llm: LlmConfig | null,
): Cost {
  if (!llm) return { stt: 0, llm: 0 };
  const { pricing } = llm;
  const pass = (words: number) =>
    words > 0 ? (words * TOKENS_PER_WORD * (pricing.llm_per_mtok_in + pricing.llm_per_mtok_out)) / 1e6 : 0;

  let stt = 0;
  let llmCost = 0;
  for (const it of items) {
    if (!selected.has(it.id)) continue;
    if (it.item_type === "podcast") {
      if (llm.stt_available) stt += episodeCost(it, pricing);
      continue;
    }
    if (!llm.available || it.has_transcript === false) continue;
    const words =
      it.item_type === "youtube" ? (it.word_count ?? 0) : (it.estimated_size_chars ?? 0) / CHARS_PER_WORD;
    for (const id of roles) {
      if (ROLE_PASSES[id as RoleId]?.(it)) llmCost += pass(words);
    }
  }
  return { stt, llm: llmCost };
}

// "$0.12", or "~$0.12" when it is an estimate; a fraction of a cent is never
// shown as an approximation of itself.
export function formatUsd(value: number, { approx = false } = {}): string {
  if (value <= 0) return "$0.00";
  if (value < 0.01) return "< $0.01";
  return `${approx ? "~" : ""}$${value.toFixed(2)}`;
}

// The total as the footer and the Compile button read it; null when nothing is
// metered.
export function costLabel(cost: Cost): string | null {
  const total = cost.stt + cost.llm;
  return total > 0 ? formatUsd(total, { approx: true }) : null;
}

// Toggling one key in a set, and setting many at once, without mutating it.
export function toggled<T>(set: Set<T>, key: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
}

export function withIds<T>(set: Set<T>, ids: Iterable<T>, on: boolean): Set<T> {
  const next = new Set(set);
  for (const id of ids) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}
