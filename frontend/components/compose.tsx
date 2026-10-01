"use client";

import { Kbd, ModKey } from "@/components/ui/kbd";
import { useShortcut } from "@/lib/shortcuts";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  HistoryIcon,
  PlusIcon,
  PodcastIcon,
  SearchIcon,
  SearchXIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { Notice } from "@/components/ui/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { highlightMatch } from "@/components/highlight";
import { CompilationHistory } from "@/components/compilation-history";
import { ProviderIcon } from "@/components/provider-icon";
import { ToolSketch } from "@/components/tool-sketch";
import { CompilationPane, WorkPane } from "@/components/compilation-pane";
import {
  createJob,
  MAX_SOURCES,
  search,
  type ProviderError,
  type SearchResult,
} from "@/lib/api";
import {
  getHistoryServerSnapshot,
  getHistorySnapshot,
  recordCompilation,
  subscribeHistory,
} from "@/lib/history";
import {
  loadDraft,
  normalizeUrl,
  saveDraft,
  saveJobDraft,
  stagedFromUrl,
  type Draft,
  type StagedSource,
} from "@/lib/workspace-draft";
import { cn } from "@/lib/utils";
import { useScrollFade } from "@/lib/use-scroll-fade";
import {
  MetaSep,
  SourceMedia,
  SourceTypePill,
  hostOf,
  isContainerKind,
  KIND_ORDER,
  kindFromResultType,
  kindLabel,
} from "@/components/source-kind";

// A source the user has staged for compilation. Built either from a picked
// search result or from a directly-pasted link.
// Every settled query is a paid search (ScrapeCreators + triage), so wait for a
// real pause in typing rather than every short hesitation.
const SEARCH_DEBOUNCE_MS = 800;

// The staging machine: search on the left, the compilation it builds on the
// right. Picking a result puts it in the compilation, which stays on screen
// while the search goes on — the two used to take turns inside one card.
export function Compose({ initialQuery }: { initialQuery?: string }) {
  // The server has no sessionStorage, so the workspace renders empty there and
  // remounts once on the client with the tab's saved list (browser Back, or
  // "← Sources" from a compilation, find their sources again).
  const onClient = useSyncExternalStore(noSubscribe, () => true, () => false);
  return (
    <ComposeWorkspace
      key={onClient ? "client" : "server"}
      initialQuery={initialQuery}
      initialDraft={onClient ? loadDraft() : null}
      persist={onClient}
    />
  );
}

const noSubscribe = () => () => {};

function ComposeWorkspace({
  initialQuery,
  initialDraft,
  persist,
}: {
  initialQuery?: string;
  initialDraft: Draft | null;
  persist: boolean;
}) {
  const router = useRouter();
  // Held so the clear (×) button and Escape can wipe the bar and hand focus
  // straight back, keeping the search → pick → clear → re-search loop on the
  // keyboard without a detour to the mouse.
  const inputRef = useRef<HTMLInputElement>(null);
  // Ready to type on arrival, where there is a keyboard: on a touch screen,
  // focus would throw the keyboard over the page.
  useEffect(() => {
    if (matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);
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

  const [staged, setStaged] = useState<StagedSource[]>(initialDraft?.staged ?? []);
  // The compilation's name. Suggested from the search that brought in its
  // first source, until the user types their own; a pasted link suggests
  // nothing, so the title never freezes on a URL.
  const [suggestedTitle, setSuggestedTitle] = useState(initialDraft?.suggestedTitle ?? "");
  const [typedTitle, setTypedTitle] = useState<string | null>(initialDraft?.typedTitle ?? null);
  const title = typedTitle ?? suggestedTitle;
  const [queries, setQueries] = useState<string[]>(initialDraft?.queries ?? []);
  // No pane until there is something to put in it: a staged source, or a
  // compilation this browser remembers. The search takes the full width.
  const history = useSyncExternalStore(subscribeHistory, getHistorySnapshot, getHistoryServerSnapshot);
  const showPane = staged.length > 0 || (history?.length ?? 0) > 0;

  // Kept for the tab's session, so going back finds the list again. Only the
  // client-side mount writes: the hydration pass starts empty and must not
  // wipe what the remount is about to read.
  useEffect(() => {
    if (persist) saveDraft({ staged, suggestedTitle, typedTitle, queries });
  }, [persist, staged, suggestedTitle, typedTitle, queries]);
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
    if (staged.length === 0) setSuggestedTitle(sentenceCase(trimmed));
    if (trimmed !== "" && !staged.some((s) => s.url === r.url))
      setQueries((prev) => [trimmed, ...prev.filter((q) => q !== trimmed)].slice(0, 5));
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
      stageSources([stagedFromUrl(url)]);
      setQuery("");
    }
  }

  // Removing is instant and undoable: the toast puts the source back where it
  // was, so a slip of the finger costs nothing.
  function removeStaged(url: string) {
    const index = staged.findIndex((s) => s.url === url);
    if (index === -1) return;
    const removed = staged[index];
    setStaged((prev) => prev.filter((s) => s.url !== url));
    toast("Source removed", {
      description: removed.title,
      action: {
        label: "Undo",
        onClick: () =>
          setStaged((prev) =>
            prev.some((s) => s.url === url) || prev.length >= MAX_SOURCES
              ? prev
              : [...prev.slice(0, index), removed, ...prev.slice(index)],
          ),
      },
    });
  }

  // Wipe the whole staged compilation — the "start over with entirely different
  // sources" escape hatch beside Review.
  function resetStaged() {
    setStaged([]);
    setSuggestedTitle("");
    setTypedTitle(null);
    setQueries([]);
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
        title.trim(),
      );
      // Remembered before the navigation, so a compile that is still running
      // when the tab is closed is already in this browser's list to come back
      // to. The response carries everything the snapshot needs.
      recordCompilation(job);
      saveJobDraft(job.id, { staged, suggestedTitle, typedTitle });
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
      : "Review sources";

  // "/" to the search, like most sites with one; Mod+Enter runs the pane's
  // primary action, even from the title field.
  useShortcut("/", () => inputRef.current?.focus());
  useShortcut("mod+enter", () => void onCompile(), staged.length > 0 && !submitting);

  // The layout's glow is in full colour only here, at rest; a search (or
  // leaving the page) lets it ease down to its light trace.
  useEffect(() => {
    const html = document.documentElement;
    html.toggleAttribute("data-glow-full", !showResults);
    return () => html.removeAttribute("data-glow-full");
  }, [showResults]);

  return (
    <>
      <WorkPane
        label="Search"
        // Phone, no search: hug the field so the compilation sits right
        // under it.
        className={cn(!showResults && "max-lg:flex-none")}
      >
          {/* Wide screens at rest: two growing spacers centre the whole block
              in the pane; a search shrinks them to nothing, sliding the field
              up to where the results need it. */}
          <div
            aria-hidden="true"
            className={cn(
              "hidden transition-[flex-grow] duration-500 ease-out-quint lg:block",
              // Half the bottom spacer's share: the block sits a little high,
              // so the sketch comes up into the first screen.
              showResults ? "grow-0" : "grow",
            )}
          />
          {/* The catchline, only while the page is at rest: it folds away
              (height and fade together) as soon as results need the room. */}
          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-500 ease-out-quint",
              showResults ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
            )}
            aria-hidden={showResults}
          >
            <div className="overflow-hidden">
              <div className="flex flex-col items-center gap-3 pt-2 pb-8 text-center">
                {/* Said plainly while the product is being built. */}
                <Badge variant="outline" className="border-input text-muted-foreground mb-1 font-normal">
                  Early preview
                </Badge>
                {/* Title and subtitle read as one group. */}
                <div className="flex flex-col items-center gap-2">
                  <h1 className="font-display text-display leading-display tracking-tight text-balance">
                    Make anything readable
                  </h1>
                  <p className="text-muted-foreground max-w-lg text-lg text-balance">
                    Turn video, podcast and article links into one clean document.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <form onSubmit={onSubmit} className="flex flex-col gap-2">
            {/* A plain field, the magnifier always in place. */}
            <div className="relative">
              <SearchIcon
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2"
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
                placeholder="Type a topic or paste a link…"
                size="lg"
                // The page's first stop after the title: a step lighter than
                // the ground, a firmer edge, a placeholder that reads.
                className={cn(
                  "bg-card border-input pl-12",
                  // Right: room for the in-field Add (pasted link) or the
                  // clear × (search term), nothing when empty.
                  queryIsUrl ? "pr-36" : query !== "" ? "pr-24" : "pr-12",
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
                  className="absolute top-2 right-2"
                >
                  <PlusIcon />
                  Add
                  <Kbd>↵</Kbd>
                </Button>
              ) : query === "" ? (
                // An empty bar says how to reach it from anywhere on the page.
                <Kbd className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2">
                  /
                </Kbd>
              ) : (
                query !== "" && (
                  // Esc does what the × does, so it is written beside it.
                  <div className="absolute top-3 right-3 flex items-center gap-1">
                    <Kbd className="text-muted-foreground pointer-events-none">Esc</Kbd>
                    <Button
                      type="button"
                      variant="nav"
                      size="icon-sm"
                      onClick={clearQuery}
                      aria-label="Clear search"
                      aria-keyshortcuts="Escape"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                )
              )}
            </div>
          </form>

          {/* Once sources are in: the searches that brought them, to go back
              to one, instead of a pane gone blank. */}
          {trimmed === "" && staged.length > 0 && queries.length > 0 && (
            <div className="flex flex-col items-center gap-3 pt-6">
              <span className="eyebrow">Search again</span>
              <div className="flex flex-wrap justify-center gap-2">
                {queries.map((q) => (
                  <Button
                    key={q}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery(q);
                      inputRef.current?.focus();
                    }}
                  >
                    <HistoryIcon />
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* First visit: something to press instead of a blank pane. A real
              search, so it shows the tool at work, and never a dead link. */}
          {trimmed === "" && staged.length === 0 && (
            // Bottom padding here, not only on the pane: content that
            // overflows the pane's box scrolls past the pane's own padding.
            <div className="flex flex-col items-center gap-3 lg:pb-8">
              {/* What a search gives, drawn in reading order: the sources it
                  finds, threaded down into one book. Not on a phone: three
                  columns don't fit, and the compilation belongs right under
                  the field there. */}
              <div className="hidden w-full pt-8 sm:block">
                <ToolSketch />
              </div>
              {/* The two uses, each with topics to try: a book to read, or
                  context for an AI. */}
              <div className="grid w-full gap-8 pt-4 text-left sm:grid-cols-2">
                {USES.map((use) => (
                  <section key={use.eyebrow} className="flex flex-col gap-2">
                    {/* Firmer ink than the usual muted: these sit on the
                        densest gold. */}
                    <span className="eyebrow text-foreground">{use.eyebrow}</span>
                    <h2 className="font-display text-xl tracking-tight">{use.title}</h2>
                    {/* What goes in, or where it goes: the four most used,
                        quieter than the title, fading out to say there are
                        more. */}
                    <span
                      role="img"
                      aria-label={use.marksLabel}
                      className="text-foreground flex items-center gap-2.5 self-start [mask-image:linear-gradient(to_right,#000_40%,transparent)] pr-4 [&_svg]:size-4"
                    >
                      {use.marks}
                    </span>
                    <div className="flex flex-wrap gap-2 pt-2">
                      {use.topics.map((q) => (
                        // Suggestions, not buttons: no fill, a faint edge,
                        // quieter ink than the search field above.
                        <Button
                          key={q}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-input text-foreground bg-transparent shadow-none"
                          onClick={() => {
                            setQuery(q);
                            inputRef.current?.focus();
                          }}
                        >
                          {q}
                        </Button>
                      ))}
                    </div>
                    {/* A real one, made by the app, to see what you'd get. */}
                    <Link href={use.example} className="text-link text-foreground self-start pt-1 text-sm">
                      See example
                    </Link>
                  </section>
                ))}
              </div>
            </div>
          )}

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
          <div
            aria-hidden="true"
            className={cn(
              "hidden transition-[flex-grow] duration-500 ease-out-quint lg:block",
              showResults ? "grow-0" : "grow-2",
            )}
          />
      </WorkPane>

      {/* The compilation. On a phone it gives way to the search while one
          runs, and a compact bar (below) keeps Review within thumb's reach. */}
      {showPane && (
        <CompilationPane
          // The compilation being built, named from its first source; before
          // that there is nothing to name, and its body is the history.
          eyebrow="New compilation"
          title={staged.length > 0 ? title : "No sources yet"}
          titleClassName={staged.length > 0 ? undefined : "text-muted-foreground"}
          onTitleChange={staged.length > 0 ? setTypedTitle : undefined}
          meta={`${staged.length} of ${MAX_SOURCES} sources`}
          className={cn(showResults && "max-lg:hidden")}
          footer={
            <>
              {compileError && <Notice variant="error">{compileError}</Notice>}
              <div className="flex gap-2">
                {staged.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={resetStaged}
                    disabled={submitting}
                    className="text-muted-foreground"
                  >
                    Clear all
                  </Button>
                )}
                <Button
                  onClick={onCompile}
                  disabled={submitting || staged.length === 0}
                  aria-keyshortcuts="Control+Enter Meta+Enter"
                  className="flex-1"
                >
                  {reviewLabel}
                  {staged.length > 0 && !submitting && (
                    <Kbd>
                      <ModKey /> ↵
                    </Kbd>
                  )}
                </Button>
              </div>
            </>
          }
        >
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
        </CompilationPane>
      )}

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
    </>
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
    // Slides in from the search side when picked, so the eye follows the
    // result into the compilation. @starting-style: no JS, no library.
    <li className="bg-card shadow-surface flex items-center gap-3 rounded-lg border px-3 py-3 transition-[opacity,translate] duration-300 ease-out-quint motion-reduce:transition-none starting:-translate-x-3 starting:opacity-0">
      <SourceMedia
        kind={kind}
        url={s.url}
        thumbnail={s.thumbnail}
        duration={formatDuration(s.durationS)}
        className="h-9 w-14"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 text-sm leading-snug" title={s.title}>{s.title}</span>
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 overflow-hidden text-xs">
          <SourceTypePill kind={kind} className="shrink-0" />
          <MetaSep />
          <span className="min-w-0 truncate">{s.author ?? hostOf(s.url)}</span>
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
          <Trash2Icon />
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
        className="-mx-2 flex min-h-0 flex-1 flex-col gap-1 overflow-hidden"
      >
        {/* Enough rows to reach the bottom of any screen; the list clips
            what doesn't fit. */}
        {Array.from({ length: 16 }, (_, i) => [80, 66, 88, 58, 72][i % 5]).map((w, i) => (
          <li
            key={i}
            className="flex animate-pulse items-center gap-3.5 px-3.5 py-3.5 motion-reduce:animate-none"
            style={{ animationDelay: `${(i % 8) * 110}ms` }}
          >
            <span className="bg-muted size-5 shrink-0 rounded-sm" />
            <span className="bg-muted h-12 w-20 shrink-0 rounded" />
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span
                className="bg-muted h-3.5 rounded-full"
                style={{ width: `${w}%` }}
              />
              <span className="bg-muted h-3 w-2/5 rounded-full" />
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
          className="text-muted-foreground size-7"
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
              // No fill when picked: the checkbox says it, the row doesn't
              // say it twice.
              className="hover:bg-muted flex cursor-pointer items-center gap-4 rounded-lg px-3.5 py-4 transition-colors"
            >
              <Checkbox
                checked={checked}
                disabled={full && !checked}
                onCheckedChange={() => onToggle(r)}
              />
              <SourceMedia
                kind={kind}
                url={r.url}
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
                  <span className="min-w-0 truncate">{hostOf(r.url)}</span>
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
  const kinds = KIND_ORDER.filter((k) => counts[k]);
  if (kinds.length < 2) return null;

  const chips = [
    { key: "all", label: "All", count: results.length },
    ...kinds.map((k) => ({
      key: k,
      label: kindLabel(k),
      count: counts[k],
    })),
  ];

  return (
    // shadcn's line tabs: the current one carries the ink and a gold
    // underline, the rest stay quiet.
    <Tabs value={active} onValueChange={(v) => onChange(String(v))}>
      <TabsList variant="line" aria-label="Filter by type">
        {chips.map(({ key, label, count }) => (
          <TabsTrigger key={key} value={key} className="after:bg-primary px-2">
            {label}
            <span className="text-muted-foreground text-xs font-normal tabular-nums">
              {count}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
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
const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "duration-asc", label: "Shortest" },
  { value: "duration-desc", label: "Longest" },
  { value: "title", label: "Title A–Z" },
];

function SortSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 text-sm sm:ml-auto">
      <span className="text-muted-foreground">Sort</span>
      <Select
        items={SORT_OPTIONS}
        value={value}
        onValueChange={(v) => typeof v === "string" && onChange(v)}
      >
        {/* Borderless: it reads as a word in the filter row, not a field. */}
        <SelectTrigger
          size="sm"
          aria-label="Sort results"
          className="hover:bg-muted border-transparent bg-transparent px-2 dark:bg-transparent"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {SORT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// The sources a query reaches, shown as a row of bare glyphs under the bar
// so it's clear up front what Thothly searches: YouTube, podcasts and the
// open web. "Podcasts" (not "Apple Podcasts"): the iTunes index is just the
// keyless search engine over the open podcast ecosystem — it returns each show's
// own RSS feed, so the reach is podcasts at large, not Apple-only content.
const USES: {
  eyebrow: string;
  title: string;
  marks: React.ReactNode;
  marksLabel: string;
  topics: string[];
  example: string;
}[] = [
  {
    eyebrow: "For reading",
    title: "Your backlog, as one book.",
    // Only what the app really reads, most used first: YouTube, podcasts
    // (any show, through its feed), Wikipedia, blogs such as Substack.
    marks: (
      <>
        <ProviderIcon provider="youtube" />
        <PodcastIcon />
        <ProviderIcon provider="wikipedia" />
        <ProviderIcon provider="substack" />
      </>
    ),
    marksLabel: "From YouTube, podcasts, Wikipedia, Substack and more",
    topics: ["Stoicism", "The fall of Rome"],
    example: "/examples/stoicism",
  },
  {
    eyebrow: "For AI context",
    title: "Clean context for your AI.",
    marks: (
      <>
        <ProviderIcon provider="claude" />
        <ProviderIcon provider="openai" />
        <ProviderIcon provider="gemini" />
        <ProviderIcon provider="xai" />
      </>
    ),
    marksLabel: "Works with Claude, ChatGPT, Gemini, Grok and other AIs",
    topics: ["Next.js App Router", "How transformers work"],
    example: "/examples/how-transformers-work",
  },
];

const SOURCES_FULL = `${MAX_SOURCES} sources is the limit for one compilation. Remove one to add another.`;

// ── helpers ──────────────────────────────────────────────────────────────────

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
