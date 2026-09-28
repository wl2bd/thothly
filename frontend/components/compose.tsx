"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  ViewTransition,
} from "react";
import { useRouter } from "next/navigation";

import {
  GlobeIcon,
  PlayIcon,
  PlusIcon,
  PodcastIcon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from "lucide-react";

import { Notice } from "@/components/ui/notice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { highlightMatch } from "@/components/highlight";
import { CompilationHistory } from "@/components/compilation-history";
import {
  createJob,
  MAX_SOURCES,
  search,
  type ProviderError,
  type ResultType,
  type SearchResult,
} from "@/lib/api";
import { recordCompilation } from "@/lib/history";
import { cn } from "@/lib/utils";
import { useScrollFade } from "@/lib/use-scroll-fade";
import {
  MetaSep,
  SourceFavicon,
  SourceMedia,
  SourceTypePill,
  hostOf,
  isContainerKind,
  kindFromResultType,
  kindLabel,
  type SourceKind,
} from "@/components/source-kind";

// A source the user has staged for compilation. Built either from a picked
// search result or from a directly-pasted link.
interface StagedSource {
  url: string;
  title: string;
  type: ResultType;
  source: string;
  thumbnail: string | null;
  durationS: number | null;
  // For a podcast episode this is the show name; for other kinds it's the
  // author/channel. Kept so the Sources recap can show it (an episode's title
  // alone reads like a show name without it).
  author: string | null;
}

// Every settled query is a paid search (ScrapeCreators + triage), so wait for a
// real pause in typing rather than every short hesitation.
const SEARCH_DEBOUNCE_MS = 800;

// The staging machine: search on the left, the compilation it builds on the
// right. Picking a result puts it in the compilation, which stays on screen
// while the search goes on — the two used to take turns inside one card.
export function Compose({ initialQuery }: { initialQuery?: string }) {
  const router = useRouter();
  // Held so the clear (×) button and Escape can wipe the bar and hand focus
  // straight back, keeping the search → pick → clear → re-search loop on the
  // keyboard without a detour to the mouse.
  const inputRef = useRef<HTMLInputElement>(null);
  // True only between a pointer press on a result and its toggle. Lets a click
  // pick hand focus back to the search bar (keeping search → pick → search
  // fluid) WITHOUT stealing it from a keyboard user tabbing the checkboxes.
  const pickedByPointer = useRef(false);

  // Seeded from ?q=…, so an old /app?q= link arrives with its search running.
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchErrors, setSearchErrors] = useState<ProviderError[]>([]);
  const [searching, setSearching] = useState(false);
  // The query the current `results` belong to — lets the list distinguish a
  // search that hasn't run yet from one that settled empty (see the effect).
  const [settledQuery, setSettledQuery] = useState("");
  // Which content type to show ("all" = no filter), and how to order them
  // ("relevance" = the backend's cross-provider ranking). Filtering is by TYPE
  // (Video / Episode / Article), not by provider, so it stays generalist as new
  // platforms are added. Both reset on every new search so stale controls never
  // blank out or mis-order the next query.
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("relevance");

  const [staged, setStaged] = useState<StagedSource[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Two error slots, one per pane: a failed search is said where the search
  // is, a failed Review where the Review button is.
  const [error, setError] = useState<string | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);

  const trimmed = query.trim();
  const queryIsUrl = looksLikeUrl(trimmed);
  // The results panel is gated on a DEFERRED query, so its appearance and
  // disappearance ride a transition (which activates the flow-card
  // ViewTransition) — the card animates open as the search launches and shut
  // when the bar clears — while the input stays on the live `query` so typing
  // never lags behind a frame.
  const deferredTrimmed = useDeferredValue(query).trim();

  // Debounced multi-provider search. A pasted link never triggers a search
  // (it's added directly on Enter); only free text does. Each keystroke aborts
  // the in-flight request so only the latest query's results land. All state
  // updates happen inside the deferred callback (never synchronously in the
  // effect body) so a fast typer doesn't cause cascading re-renders.
  //
  // `settledQuery` records which query the current results belong to. Until a
  // search settles for the live query it stays out of sync, which is how the
  // list tells "search pending" (show the skeleton) apart from "search returned
  // nothing" (show the empty state) — otherwise the gap between the keystroke
  // and the debounced request flashes "No results" before the search even runs.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const isReset = trimmed === "" || queryIsUrl;

    const timer = setTimeout(async () => {
      if (isReset) {
        // Clearing the bar folds the card back to its pristine state through the
        // same flow-card transition as every other phase change.
        startTransition(() => {
          setResults([]);
          setSearchErrors([]);
          setTypeFilter("all");
          setSortBy("relevance");
          setSettledQuery(trimmed);
          setSearching(false);
        });
        return;
      }
      // The pending skeleton stays immediate (instant feedback to a keystroke);
      // only the settle below is a transition.
      setSearching(true);
      try {
        const resp = await search(trimmed, controller.signal);
        if (cancelled) return;
        // Settle inside a transition so the card cross-fades + resizes from the
        // skeleton to the results (the flow-card ViewTransition) rather than
        // popping — the same motion as the face swap and the job phases.
        startTransition(() => {
          setResults(resp.results);
          setSearchErrors(resp.errors);
          setTypeFilter("all");
          setSortBy("relevance");
          setSettledQuery(trimmed);
          setSearching(false);
        });
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
        startTransition(() => {
          setResults([]);
          setSearchErrors([]);
          setSettledQuery(trimmed);
          setSearching(false);
        });
      }
    }, isReset ? 0 : SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed, queryIsUrl]);

  // Checking a result stages it straight into the Sources list (unchecking
  // removes it) — there's no separate "add" step. The checkbox reads its state
  // from `staged`, so the results list, the Sources recap and the count always
  // agree, and a selection survives moving from one search to the next.
  function toggleResultStaged(r: SearchResult) {
    setStaged((prev) =>
      prev.some((s) => s.url === r.url)
        ? prev.filter((s) => s.url !== r.url)
        : prev.length >= MAX_SOURCES
          ? prev
          : [
            ...prev,
            {
              url: r.url,
              title: r.title,
              type: r.type,
              source: r.source,
              thumbnail: r.thumbnail,
              durationS: r.duration_s,
              author: r.author,
            },
          ],
    );
    // Click picks return to the bar so the next query types straight away;
    // keyboard picks keep their place in the list (see pickedByPointer).
    if (pickedByPointer.current) inputRef.current?.focus();
    pickedByPointer.current = false;
  }

  function stageSources(toAdd: StagedSource[]) {
    setStaged((prev) => {
      const seen = new Set(prev.map((s) => s.url));
      const merged = [...prev];
      for (const s of toAdd) {
        if (!seen.has(s.url)) {
          merged.push(s);
          seen.add(s.url);
        }
      }
      return merged.slice(0, MAX_SOURCES);
    });
  }

  // Enter only acts on a pasted link: it's added straight to the sources (the
  // paste-a-URL flow). For a plain search term Enter does nothing — search runs
  // automatically (debounced), and proceeding is a deliberate click (Check →
  // Review), not a keystroke.
  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (queryIsUrl) {
      if (staged.length >= MAX_SOURCES) {
        setError(SOURCES_FULL);
        return;
      }
      const url = normalizeUrl(trimmed);
      stageSources([
        {
          url,
          title: prettyUrl(url),
          type: detectType(url),
          source: detectSource(url),
          thumbnail: null,
          durationS: null,
          author: null,
        },
      ]);
      setQuery("");
    }
  }

  function removeStaged(url: string) {
    setStaged((prev) => prev.filter((s) => s.url !== url));
  }

  // Wipe the whole staged compilation — the "start over with entirely different
  // sources" escape hatch beside Review.
  function resetStaged() {
    setStaged([]);
  }

  // Empty the bar and hand focus back — the shared "start a fresh search"
  // gesture behind the clear (x), Escape, and the "New search" button.
  function clearQuery() {
    setQuery("");
    inputRef.current?.focus();
  }

  async function onCompile() {
    if (staged.length === 0) return;
    setSubmitting(true);
    setCompileError(null);
    try {
      const job = await createJob(
        staged.map((s) =>
          // Always carry the title the user just saw in search, so the loading
          // screen can label each source by name instead of a raw URL. `kind` is
          // sent ONLY for podcasts (their audio URL isn't self-identifying and
          // needs the duration hint); sending it for other kinds would override
          // the backend's URL-based detection and misroute them.
          s.source === "podcast"
            ? {
                url: s.url,
                kind: "podcast",
                title: s.title,
                duration_s: s.durationS ?? undefined,
              }
            : { url: s.url, title: s.title },
        ),
      );
      // Remembered before the navigation, so a compile that is still running
      // when the tab is closed is already in this browser's list to come back
      // to. The response carries everything the snapshot needs.
      recordCompilation(job);
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      setCompileError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const showResults = !looksLikeUrl(deferredTrimmed) && deferredTrimmed !== "";
  // True once a search has actually run for the live query. Before that the list
  // shows a skeleton, not the empty state, so "No results" can never precede the
  // loading indicator for a query whose search is still pending.
  const settled = settledQuery === trimmed;
  const filteredResults =
    typeFilter === "all"
      ? results
      : results.filter((r) => kindFromResultType(r.type) === typeFilter);
  const visibleResults = sortResults(filteredResults, sortBy);
  // Checkbox state for each result is read from the staged list (by URL), so the
  // results, the compilation and the count never drift apart.
  const stagedUrls = new Set(staged.map((s) => s.url));
  const full = staged.length >= MAX_SOURCES;
  const reviewLabel = submitting
    ? "Starting…"
    : staged.length > 0
      ? `Review ${staged.length} ${staged.length === 1 ? "source" : "sources"}`
      : "Review";

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* Search pane. Capped and centred so a wide screen doesn't stretch a
          result title across 2000px. */}
      <section
        aria-label="Search"
        className={cn(
          "flex min-h-0 flex-1 flex-col lg:overflow-y-auto",
          // Phone, no search: hug the field so the compilation sits right
          // under it.
          !showResults && "max-lg:flex-none",
        )}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-5 p-4 sm:p-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-2">
            {/* A plain field, the magnifier always in place. */}
            <div className="relative">
              <SearchIcon
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
              />
              <Input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Escape wipes the bar (and only then) so a held query can be
                  // cleared without reaching for the × or select-all-delete.
                  if (e.key === "Escape" && query !== "") {
                    e.preventDefault();
                    clearQuery();
                  }
                }}
                placeholder="Search or paste a link…"
                className={cn(
                  "bg-card dark:bg-card h-12 rounded-xl pl-10 shadow-sm",
                  // Right: room for the in-field Add (pasted link) or the
                  // clear × (search term), nothing when empty.
                  queryIsUrl ? "pr-28" : query !== "" ? "pr-12" : "pr-4",
                )}
                autoComplete="off"
              />
              {/* Trailing in-field control. A pasted link gets its own Add
                  action right where it was typed (Enter mirrors it); a search
                  term gets the clear ×; an empty bar gets neither. */}
              {queryIsUrl ? (
                <Button
                  type="submit"
                  disabled={submitting}
                  aria-label="Add to sources"
                  // An inset, not -translate-y-1/2: Button's press affordance
                  // writes the same translate and would drop the pill.
                  className="absolute top-1.5 right-1.5 h-9"
                >
                  <PlusIcon />
                  Add
                </Button>
              ) : (
                query !== "" && (
                  <Button
                    type="button"
                    variant="nav"
                    size="icon-sm"
                    onClick={clearQuery}
                    aria-label="Clear search"
                    className="absolute top-2 right-2"
                  >
                    <XIcon className="size-4" />
                  </Button>
                )
              )}
            </div>
            {!queryIsUrl && <SearchSourcesHint />}
          </form>

          {error && <Notice variant="error">{error}</Notice>}

          {showResults &&
            searchErrors.length > 0 &&
            (() => {
              // Concrete, distinct names — "web search", not "the web" (too
              // broad when YouTube/podcast results are still shown). The raw
              // provider codes are lowercase: "web", "youtube", "podcast".
              const labels: Record<string, string> = {
                web: "web search",
                youtube: "YouTube",
                podcast: "podcasts",
              };
              const names = searchErrors.map((e) => labels[e.provider] ?? e.provider);
              const list =
                names.length > 1
                  ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
                  : names[0];
              const subject = list.charAt(0).toUpperCase() + list.slice(1);
              // Build the whole sentence as one string so there's never a glued
              // "web"+"didn't" from JSX collapsing the space between nodes.
              return (
                <Notice variant="warning">
                  {`${subject} didn't respond. Showing the other results.`}
                </Notice>
              );
            })()}

          {/* Full: say why the remaining results can't be checked. */}
          {showResults && full && <Notice variant="info">{SOURCES_FULL}</Notice>}

          {/* Chips and Sort share a row where there is room for one. On a phone
              the chips wrap and Sort stacks under them. */}
          {showResults && results.length > 0 && (
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <TypeFilter
                results={results}
                active={typeFilter}
                onChange={(v) => startTransition(() => setTypeFilter(v))}
              />
              <SortSelect
                value={sortBy}
                onChange={(v) => startTransition(() => setSortBy(v))}
              />
            </div>
          )}

          {showResults && (
            <SearchResults
              searching={searching}
              settled={settled}
              query={trimmed}
              results={visibleResults}
              stagedUrls={stagedUrls}
              full={full}
              onToggle={toggleResultStaged}
              onPointerPick={() => (pickedByPointer.current = true)}
            />
          )}
        </div>
      </section>

      {/* The compilation. Same flow-card identity as the job page's card, so
          Review morphs this pane into the job instead of hard-cutting. On a
          phone it gives way to the search while one runs, and a compact bar
          (below) keeps Review within reach of the thumb. */}
      <ViewTransition name="flow-card">
        <aside
          aria-label="Your compilation"
          className={cn(
            "bg-surface-sunken flex min-h-0 flex-col border-t max-lg:flex-1 lg:border-t-0 lg:border-l",
            showResults && "max-lg:hidden",
          )}
        >
          <div className="flex items-baseline justify-between gap-3 border-b px-5 py-4">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Your compilation
            </h2>
            {staged.length > 0 && (
              <span className="text-muted-foreground text-xs tabular-nums">
                {staged.length} of {MAX_SOURCES} sources
              </span>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            {staged.length === 0 ? (
              <CompilationHistory />
            ) : (
              <ul className="flex flex-col gap-2">
                {staged.map((s) => (
                  <StagedRow
                    key={s.url}
                    source={s}
                    onRemove={() => removeStaged(s.url)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t p-5">
            {compileError && <Notice variant="error">{compileError}</Notice>}
            <div className="flex items-center justify-between gap-3">
              {staged.length > 0 ? (
                <button
                  type="button"
                  onClick={resetStaged}
                  disabled={submitting}
                  className="text-muted-foreground hover:text-foreground text-xs transition-colors disabled:opacity-50"
                >
                  Clear all
                </button>
              ) : (
                <span className="text-muted-foreground text-xs">
                  Up to {MAX_SOURCES} sources
                </span>
              )}
              <Button
                onClick={onCompile}
                disabled={submitting || staged.length === 0}
              >
                {reviewLabel}
              </Button>
            </div>
          </div>
        </aside>
      </ViewTransition>

      {/* Phone only, while a search runs: the compilation shrinks to its count
          and its action, pinned at the bottom of the screen. */}
      {showResults && staged.length > 0 && (
        <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 flex items-center justify-between gap-3 border-t px-4 py-3 backdrop-blur lg:hidden">
          <span className="text-muted-foreground text-sm tabular-nums">
            {staged.length} of {MAX_SOURCES} sources
          </span>
          <Button onClick={onCompile} disabled={submitting}>
            {reviewLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

// One source in the compilation pane. The pane is 400px wide, so the row is the
// search row's compact cousin: smaller media, one meta line.
function StagedRow({
  source: s,
  onRemove,
}: {
  source: StagedSource;
  onRemove: () => void;
}) {
  const kind = kindFromResultType(s.type);
  return (
    <li className="bg-background flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <SourceMedia
        kind={kind}
        thumbnail={s.thumbnail}
        duration={formatDuration(s.durationS)}
        className="h-9 w-14"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm">{s.title}</span>
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 overflow-hidden text-xs">
          <SourceTypePill kind={kind} className="shrink-0" />
          <MetaSep />
          <span className="inline-flex min-w-0 items-center gap-1">
            <SourceFavicon url={s.url} />
            <span className="truncate">{s.author ?? hostOf(s.url)}</span>
          </span>
          {isContainerKind(kind) && (
            <>
              <MetaSep />
              <span className="shrink-0">expands when you review</span>
            </>
          )}
        </span>
      </span>
      <Tooltip content="Remove source">
        <Button
          type="button"
          variant="nav"
          size="icon-sm"
          onClick={onRemove}
          aria-label="Remove source"
        >
          <XIcon />
        </Button>
      </Tooltip>
    </li>
  );
}

interface SearchResultsProps {
  searching: boolean;
  // Whether a search has actually settled for the live query. Until it has, the
  // list shows the skeleton rather than the empty state.
  settled: boolean;
  query: string;
  results: SearchResult[];
  stagedUrls: Set<string>;
  // The compilation holds MAX_SOURCES already: unpicked rows can't be checked.
  full: boolean;
  onToggle: (result: SearchResult) => void;
  // Fired on a pointer press of a row, so the parent can tell a click pick from
  // a keyboard pick and only return focus to the bar for the former.
  onPointerPick: () => void;
}

function SearchResults({
  searching,
  settled,
  query,
  results,
  stagedUrls,
  full,
  onToggle,
  onPointerPick,
}: SearchResultsProps) {
  // The list scrolls inside the card between the filter row and the sources
  // footer, so it fades on both edges that hide content — the same softening as
  // every other scroll area, so rows dissolve at the seams instead of cutting on
  // a hard line. Re-measured when the result count changes.
  const listRef = useRef<HTMLUListElement>(null);
  const fade = useScrollFade(listRef, { top: true, bottom: true }, [
    results.length,
  ]);

  // Search pending or in flight, with no prior results to keep on screen: stand
  // in skeleton rows that mirror the real row geometry — media tile, title line,
  // meta line — so when results land they replace the placeholders in place
  // rather than the list popping in from a stray spinner. Keyed off `settled`
  // (not `searching`) so the gap between a keystroke and the debounced request
  // shows the skeleton too, never a flash of the empty state. The pulse is
  // staggered for a soft wave and stilled under reduced motion (bars still read).
  if (!settled && results.length === 0) {
    return (
      <ul
        aria-busy="true"
        aria-label="Searching"
        className="-mx-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
      >
        {[80, 66, 88, 58, 72].map((w, i) => (
          <li
            key={i}
            className="flex animate-pulse items-center gap-3.5 px-3.5 py-3.5 motion-reduce:animate-none"
            style={{ animationDelay: `${i * 110}ms` }}
          >
            <span className="bg-foreground/10 size-5 shrink-0 rounded-[5px]" />
            <span className="bg-foreground/10 h-12 w-20 shrink-0 rounded" />
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span
                className="bg-foreground/10 h-3.5 rounded-full"
                style={{ width: `${w}%` }}
              />
              <span className="bg-foreground/10 h-3 w-2/5 rounded-full" />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  // Settled and empty: a centered, deliberate state (not a stray line). The
  // query is echoed back and the next move is spelled out, including the
  // paste-a-link path that always works.
  if (results.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-3 px-6 py-10 text-center">
        <SearchXIcon
          className="text-muted-foreground/40 size-7"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1">
          <p className="text-foreground text-sm font-medium">
            No results for “{query}”
          </p>
          <p className="text-xs leading-relaxed text-balance">
            Try different words, or paste a link to add it directly.
          </p>
        </div>
      </div>
    );
  }

  // Settled with results. While a refinement is in flight the old rows stay put
  // but dim, so the list reads as "updating" instead of flickering empty.
  return (
    <ul
      ref={listRef}
      style={fade}
      aria-busy={searching || undefined}
      className={cn(
        "-mx-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto transition-opacity",
        searching && "opacity-60",
      )}
    >
      {results.map((r) => {
        const checked = stagedUrls.has(r.url);
        const kind = kindFromResultType(r.type);
        return (
          <li key={r.id}>
            <label
              onPointerDown={onPointerPick}
              className={cn(
                "flex cursor-pointer items-center gap-3.5 rounded-lg px-3.5 py-3.5 transition-colors",
                checked ? "bg-foreground/6" : "hover:bg-foreground/5",
              )}
            >
              <Checkbox
                checked={checked}
                disabled={full && !checked}
                onCheckedChange={() => onToggle(r)}
              />
              <SourceMedia
                kind={kind}
                thumbnail={r.thumbnail}
                duration={formatDuration(r.duration_s)}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="line-clamp-2 text-sm leading-snug">
                  {highlightMatch(r.title, query)}
                </span>
                <span className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs sm:flex-nowrap sm:overflow-hidden">
                  <SourceTypePill kind={kind} className="shrink-0" />
                  <MetaSep />
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <SourceFavicon url={r.url} />
                    <span className="truncate">{hostOf(r.url)}</span>
                  </span>
                  {r.author && (
                    <>
                      <MetaSep />
                      <span className="min-w-0 truncate">{r.author}</span>
                    </>
                  )}
                  {isContainerKind(kind) && (
                    <>
                      <MetaSep />
                      <span className="shrink-0">expands when you review</span>
                    </>
                  )}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

// Content-type filter chips above the results. Grouping is by TYPE (Video /
// Episode / Article), not by provider, so "YouTube" and "Video" can't disagree
// and a new platform folds into the matching type instead of adding a chip. Only
// shown when more than one type is present; counts are per type.
function TypeFilter({
  results,
  active,
  onChange,
}: {
  results: SearchResult[];
  active: string;
  onChange: (kind: string) => void;
}) {
  const counts: Record<string, number> = {};
  for (const r of results) {
    const k = kindFromResultType(r.type);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const kinds = Object.keys(counts);
  if (kinds.length < 2) return null;

  const chips = [
    { key: "all", label: "All", count: results.length },
    ...kinds.map((k) => ({
      key: k,
      label: kindLabel(k as SourceKind),
      count: counts[k],
    })),
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(({ key, label, count }) => (
        <Button
          key={key}
          type="button"
          size="xs"
          variant={active === key ? "default" : "secondary"}
          onClick={() => onChange(key)}
        >
          {label}
          <span className="ml-1 opacity-60">{count}</span>
        </Button>
      ))}
    </div>
  );
}

// Result ordering. "relevance" keeps the backend's cross-provider ranking
// untouched; the others are client-side. Date isn't available across providers,
// so it's not offered. Results without a duration (web) sort last when ordering
// by length.
function sortResults(results: SearchResult[], sortBy: string): SearchResult[] {
  if (sortBy === "relevance") return results;
  const sorted = [...results];
  if (sortBy === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortBy === "duration-asc" || sortBy === "duration-desc") {
    const dir = sortBy === "duration-asc" ? 1 : -1;
    sorted.sort((a, b) => {
      if (a.duration_s == null && b.duration_s == null) return 0;
      if (a.duration_s == null) return 1;
      if (b.duration_s == null) return -1;
      return (a.duration_s - b.duration_s) * dir;
    });
  }
  return sorted;
}

// Pushed to the far end of the chip row where the two share one, but only
// there: on its own stacked line the auto margin would strand it against the
// right edge, away from the chips it belongs with.
function SortSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs sm:ml-auto">
      Sort
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-background rounded-md border px-2 py-1 text-xs"
      >
        <option value="relevance">Relevance</option>
        <option value="duration-asc">Shortest</option>
        <option value="duration-desc">Longest</option>
        <option value="title">Title A–Z</option>
      </select>
    </label>
  );
}

// The sources a query reaches, shown as a small overlapping pile under the bar
// so it's clear up front what Thothly searches: YouTube, podcasts and the
// open web. "Podcasts" (not "Apple Podcasts"): the iTunes index is just the
// keyless search engine over the open podcast ecosystem — it returns each show's
// own RSS feed, so the reach is podcasts at large, not Apple-only content.
// Monochrome lucide glyphs in the muted (secondary) tone — never the
// brand gold, never multicolor brand logos that would clash on the night ground.
// lucide carries no brand marks, so each source reads through its medium, in the
// same icon language the funnel uses (Play = video, podcast waves, globe = web);
// each is ringed in the panel's own sunken surface so they read as a stacked pile.
const SEARCH_SOURCES = [
  { key: "youtube", label: "YouTube", Icon: PlayIcon },
  { key: "podcast", label: "Podcasts", Icon: PodcastIcon },
  { key: "web", label: "the web", Icon: GlobeIcon },
];

function SearchSourcesHint() {
  return (
    <p className="text-muted-foreground flex items-center justify-center gap-2 px-1 text-xs">
      <span className="flex items-center" aria-hidden="true">
        {SEARCH_SOURCES.map(({ key, label, Icon }, i) => (
          <span
            key={key}
            title={label}
            className="ring-surface-sunken bg-muted flex size-6 items-center justify-center rounded-full ring-2"
            style={{
              marginLeft: i === 0 ? 0 : "-0.25rem",
              zIndex: SEARCH_SOURCES.length - i,
            }}
          >
            <Icon className="size-3.5" />
          </span>
        ))}
      </span>
      <span>
        Searches YouTube, podcasts and the web
        {/* Brave's free monthly API credit requires this attribution. */}
        <span>
          , via{" "}
          <a
            href="https://brave.com/search/api/"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Brave
          </a>
        </span>
      </span>
    </p>
  );
}

const SOURCES_FULL = `${MAX_SOURCES} sources is the limit for one compilation. Remove one to add another.`;

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDuration(s: number | null): string | null {
  if (s == null) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

function looksLikeUrl(s: string): boolean {
  if (s === "" || /\s/.test(s)) return false;
  return /^https?:\/\//i.test(s) || /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(s);
}

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (t === "") return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

// Client-side type/source detection mirrors the backend's detect_kind so a
// pasted link gets a sensible badge before discovery re-derives it server-side.
function detectType(url: string): ResultType {
  const u = url.toLowerCase();
  if (u.includes("youtube.com/watch") || u.includes("youtu.be/")) return "video";
  if (u.includes("list=") || u.includes("youtube.com/playlist")) return "playlist";
  if (/youtube\.com\/(@|channel\/|c\/|user\/)/.test(u)) return "channel";
  return "web";
}

function detectSource(url: string): string {
  const u = url.toLowerCase();
  return u.includes("youtube.com") || u.includes("youtu.be") ? "youtube" : "web";
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}
