"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ChevronDownIcon,
  ConstructionIcon,
  FileTextIcon,
  GlobeIcon,
  ListIcon,
  MicIcon,
  PlayIcon,
  PodcastIcon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from "lucide-react";

import { AnimatedGoldBorder } from "@/components/ui/animated-gold-border";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StoneBorder } from "@/components/ui/stone-border";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { GitHubStar } from "@/components/github-star";
import { highlightMatch } from "@/components/highlight";
import { Logotype } from "@/components/brand";
import { Grain } from "@/components/grain";
import { HieroglyphRain } from "@/components/hieroglyph-rain";
import {
  createJob,
  search,
  type ProviderError,
  type ResultType,
  type SearchResult,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  MetaSep,
  SourceFavicon,
  SourceMedia,
  SourceMetric,
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

const SEARCH_DEBOUNCE_MS = 350;

export default function Home() {
  const router = useRouter();
  // Held so the clear (×) button and Escape can wipe the bar and hand focus
  // straight back, keeping the search → pick → clear → re-search loop on the
  // keyboard without a detour to the mouse.
  const inputRef = useRef<HTMLInputElement>(null);
  // True only between a pointer press on a result and its toggle. Lets a click
  // pick hand focus back to the search bar (keeping search → pick → search
  // fluid) WITHOUT stealing it from a keyboard user tabbing the checkboxes.
  const pickedByPointer = useRef(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchErrors, setSearchErrors] = useState<ProviderError[]>([]);
  const [searching, setSearching] = useState(false);
  // Which content type to show ("all" = no filter), and how to order them
  // ("relevance" = the backend's cross-provider ranking). Filtering is by TYPE
  // (Video / Episode / Article), not by provider, so it stays generalist as new
  // platforms are added. Both reset on every new search so stale controls never
  // blank out or mis-order the next query.
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("relevance");

  const [staged, setStaged] = useState<StagedSource[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  const queryIsUrl = looksLikeUrl(trimmed);

  // Debounced multi-provider search. A pasted link never triggers a search
  // (it's added directly on Enter); only free text does. Each keystroke aborts
  // the in-flight request so only the latest query's results land. All state
  // updates happen inside the deferred callback (never synchronously in the
  // effect body) so a fast typer doesn't cause cascading re-renders.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const isReset = trimmed === "" || queryIsUrl;

    const timer = setTimeout(async () => {
      if (isReset) {
        setResults([]);
        setSearchErrors([]);
        setTypeFilter("all");
        setSortBy("relevance");
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const resp = await search(trimmed, controller.signal);
        if (cancelled) return;
        setResults(resp.results);
        setSearchErrors(resp.errors);
        setTypeFilter("all");
        setSortBy("relevance");
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setResults([]);
        setSearchErrors([]);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setSearching(false);
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
      return merged;
    });
  }

  // Enter reads the bar: a pasted link is added straight to the sources (the
  // old paste-a-URL flow). Otherwise — an empty bar OR a plain search term — it
  // proceeds to Review when a compilation is staged, mirroring the Enter badge
  // on that button. Search runs automatically (debounced), so Enter is free to
  // mean "proceed" rather than "search".
  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (queryIsUrl) {
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
      return;
    }
    if (staged.length > 0) onCompile();
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
    setError(null);
    try {
      const job = await createJob(
        staged.map((s) =>
          // A podcast episode's audio URL isn't self-identifying and carries no
          // title, so pass both as hints. Other kinds re-derive their own.
          s.source === "podcast"
            ? {
                url: s.url,
                kind: "podcast",
                title: s.title,
                duration_s: s.durationS ?? undefined,
              }
            : { url: s.url },
        ),
      );
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const showResults = !queryIsUrl && trimmed !== "";
  const filteredResults =
    typeFilter === "all"
      ? results
      : results.filter((r) => kindFromResultType(r.type) === typeFilter);
  const visibleResults = sortResults(filteredResults, sortBy);
  // Checkbox state for each result is read from the staged list (by URL), so the
  // results, the Sources recap and the count never drift apart.
  const stagedUrls = new Set(staged.map((s) => s.url));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <section
          id="top"
          className={`relative isolate flex min-h-[66svh] scroll-mt-14 flex-col items-center justify-center overflow-hidden px-6 ${showResults ? "py-10" : "py-16 sm:py-20"}`}
          style={{
            background:
              "linear-gradient(to bottom, var(--hero-ground) 0%, var(--hero-ground) 35%, transparent 100%)",
          }}
        >
          {/* Hero backdrop. A desert-gold glyph rain (Thoth's hieroglyphs +
              falling letters) runs behind the content in BOTH modes: warm
              white-hot on the night ground, deep gold on the light page. The
              fold's own ground (the section's --hero-ground gradient, warm taupe
              on light / the near-black page on dark) carries the warmth and lets
              the deep glyphs read; above it a scrim pools that ground behind the
              headline so the text always clears the rain (warm taupe on light,
              black on dark). Grain over all. Decorative, behind content,
              reduced-motion-safe. */}
          <HieroglyphRain className="pointer-events-none absolute inset-0 -z-30 size-full opacity-90 [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_84%,transparent)]" />
          {/* Grain stays a whisper on the night ground: mix-blend-overlay lifts
              the near-black toward grey fast, so dark opacity is kept low (~0.08)
              to keep the ground a rich black under the gold rain. */}
          <Grain className="pointer-events-none absolute inset-0 -z-10 size-full opacity-[0.12] mix-blend-overlay dark:opacity-[0.08]" />
          {/* Legibility scrim, painted over the grain. Its tone is the single
              theme-flipped --hero-scrim token (warm taupe on light, near-black on
              dark) so it can never bleed across modes. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ background: "var(--hero-scrim)" }}
          />
          <div className={`flex w-full max-w-2xl flex-col ${showResults ? "gap-6" : "gap-10"}`}>
            <div className="flex flex-col items-center gap-5 text-center">
              <span className="border-gold/30 bg-gold/10 text-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
                <ConstructionIcon className="text-gold size-3.5" aria-hidden="true" />
                Work in progress
              </span>
              <h1 className="font-display text-[2.75rem] leading-[1.05] tracking-tight text-balance sm:text-6xl">
                Make anything readable
              </h1>
              <p className="text-muted-foreground max-w-xl text-balance text-lg leading-[1.4] sm:text-xl">
                Turn videos, podcasts, articles, even whole playlists into one
                clean read for your e-reader or your AI.
              </p>
            </div>

        <Card className="bg-surface-sunken shadow-[0_0_48px_rgb(0_0_0/0.12)] dark:shadow-[0_0_60px_rgb(0_0_0/0.5)] flex max-h-[72svh] flex-col">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-5">
            <form onSubmit={onSubmit} className="flex flex-col gap-2">
              <AnimatedGoldBorder>
                <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
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
                  className="border-transparent bg-background pr-9 pl-9 focus-visible:ring-0 dark:bg-background"
                  autoFocus
                />
                {query !== "" && (
                  <button
                    type="button"
                    onClick={clearQuery}
                    aria-label="Clear search"
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
                  >
                    <XIcon className="size-4" />
                  </button>
                )}
              </AnimatedGoldBorder>
              {queryIsUrl && (
                <p className="text-muted-foreground px-1 text-center text-xs">
                  Looks like a link. Press{" "}
                  <kbd className="rounded border px-1 font-mono">Enter</kbd> to add
                  it to your sources.
                </p>
              )}
              <SearchSourcesHint />
            </form>

            {error && <p className="text-destructive text-sm">{error}</p>}

            {searchErrors.length > 0 && (
              <p className="text-warning bg-warning/10 rounded-lg px-3 py-2 text-xs">
                {searchErrors.map((e) => e.provider).join(", ")} unavailable.
                Showing the other results.
              </p>
            )}

            {showResults && results.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <TypeFilter
                  results={results}
                  active={typeFilter}
                  onChange={setTypeFilter}
                />
                <SortSelect value={sortBy} onChange={setSortBy} />
              </div>
            )}

            {showResults && (
              <SearchResults
                searching={searching}
                query={trimmed}
                results={visibleResults}
                stagedUrls={stagedUrls}
                onToggle={toggleResultStaged}
                onPointerPick={() => (pickedByPointer.current = true)}
              />
            )}

            {staged.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <p className="text-sm">
                  <span className="text-foreground font-semibold">
                    {staged.length}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {staged.length === 1 ? "source" : "sources"} in your
                    compilation
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={clearQuery}
                    disabled={submitting}
                  >
                    New search
                    {query !== "" && <Kbd>Esc</Kbd>}
                  </Button>
                  <Button
                    type="button"
                    onClick={onCompile}
                    disabled={submitting}
                  >
                    {submitting ? (
                      "Starting…"
                    ) : (
                      <>
                        Review
                        {!queryIsUrl && <Kbd>Enter</Kbd>}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-muted-foreground/80 mx-auto max-w-md text-center text-xs leading-relaxed text-balance">
          Some features are limited or still in progress. YouTube gets
          rate-limited from the cloud, so pasting an article or blog link works
          best for now.
        </p>

        {staged.length > 0 && (
          <section id="sources" className="scroll-mt-20 flex flex-col gap-3">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Sources · {staged.length}
            </h2>
            <ul className="flex flex-col gap-2">
              {staged.map((s) => (
                <li
                  key={s.url}
                  className="bg-card flex items-center gap-3.5 rounded-lg border px-3.5 py-3.5"
                >
                  <SourceMedia
                    kind={kindFromResultType(s.type)}
                    thumbnail={s.thumbnail}
                    className="h-10 w-16"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="truncate text-sm">{s.title}</span>
                    <span className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs sm:flex-nowrap sm:overflow-hidden">
                      <SourceTypePill
                        kind={kindFromResultType(s.type)}
                        className="shrink-0"
                      />
                      <MetaSep />
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <SourceFavicon url={s.url} />
                        <span className="truncate">{hostOf(s.url)}</span>
                      </span>
                      {s.author && (
                        <>
                          <MetaSep />
                          <span className="min-w-0 truncate">{s.author}</span>
                        </>
                      )}
                      {isContainerKind(kindFromResultType(s.type)) && (
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
                      variant="secondary"
                      size="icon"
                      onClick={() => removeStaged(s.url)}
                      aria-label="Remove source"
                      className="ml-2"
                    >
                      <XIcon />
                    </Button>
                  </Tooltip>
                </li>
              ))}
            </ul>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={resetStaged}
                disabled={submitting}
              >
                Reset
              </Button>
              <Button
                size="lg"
                onClick={onCompile}
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? "Starting…" : "Review"}
              </Button>
            </div>
          </section>
        )}

          </div>

          {/* A quiet nudge past the now-taller fold to "how it works" — only in
              the pristine state, before the user starts staging sources. Soft
              drift, not a hard bounce; dropped under reduced motion. */}
          {staged.length === 0 && !showResults && (
            <a
              href="#how-it-works"
              aria-label="See how it works"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute bottom-6 left-1/2 hidden -translate-x-1/2 rounded-full p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:block"
            >
              <ChevronDownIcon className="hero-scroll-cue size-5" />
            </a>
          )}
        </section>

        <HowItWorks />
        <DataAndFaq />
      </main>
      <SiteFooter />
    </div>
  );
}

// ── Landing chrome ───────────────────────────────────────────────────────────

function SiteHeader() {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
        <Logotype className="h-7 w-auto" title="Thothly" />
        <div className="flex items-center gap-3 sm:gap-5">
          {/* Light anchor nav: the page is short, so this orients rather than
              structures. Hidden on narrow screens to keep the header to a
              logotype + one action. */}
          <nav className="hidden items-center gap-5 sm:flex">
            <HeaderLink href="#top">Start</HeaderLink>
            <HeaderLink href="#how-it-works">How it works</HeaderLink>
            <HeaderLink href="#faq">FAQ</HeaderLink>
          </nav>
          <GitHubStar />
        </div>
      </div>
    </header>
  );
}

function HeaderLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
    >
      {children}
    </a>
  );
}

// A small keyboard-key badge surfaced inside a button to advertise its
// shortcut, kept discreet: a hairline outline (no fill) drawn in the button's
// own text colour. The text stays full-contrast (legible/accessible) while the
// cap recedes, reading on the gold primary and the neutral secondary alike.
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-current/20 px-1 py-px font-mono text-[10px] leading-none font-normal">
      {children}
    </kbd>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: 1,
      title: "Add your sources",
      body: "Search, or paste any link: a video, a podcast, an article, even a whole playlist or blog.",
    },
    {
      n: 2,
      title: "Pick what goes in",
      body: "Everything's pre-selected. Uncheck what you don't want, and preview any item before you commit.",
    },
    {
      n: 3,
      title: "Get your compilation",
      body: "A polished EPUB for your e-reader, plus a Markdown twin to feed an AI.",
    },
  ];
  // Skeleton bar widths for the faux e-reader page; null = a paragraph break.
  const lines = ["100%", "92%", "97%", "85%", null, "100%", "94%", "90%", "96%"];
  // Faux-text band widths for the markdown panel's body (after the real header).
  const mdBands = ["100%", "92%", "96%", "88%"];
  // Mixed input kinds, shown flowing into the two output formats below.
  const sources = [
    { Icon: PlayIcon, kind: "Video" },
    { Icon: MicIcon, kind: "Podcast" },
    { Icon: FileTextIcon, kind: "Article" },
    { Icon: ListIcon, kind: "Playlist" },
  ];
  return (
    <section id="how-it-works" className="scroll-mt-14 border-t px-6 py-14">
      <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-2 lg:items-start">
        <div>
          <h2 className="font-display text-2xl tracking-tight text-balance">
            How it works
          </h2>
          <ol className="mt-6 flex flex-col gap-5">
            {steps.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="text-muted-foreground/50 text-xl font-semibold tabular-nums">
                  {s.n}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-balance">
                    {s.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed text-balance">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <figure className="bg-muted flex flex-col gap-3 rounded-2xl border p-6">
          <div className="grid grid-cols-4 gap-2">
            {sources.map((s) => (
              <div
                key={s.kind}
                className="bg-surface-sunken flex flex-col items-center gap-1 rounded-lg border px-1 py-2"
              >
                <s.Icon className="text-muted-foreground size-4" />
                <span className="text-muted-foreground text-[0.55rem] leading-none">
                  {s.kind}
                </span>
              </div>
            ))}
          </div>
          {/* Source branches funnelling down into one compilation node.
              preserveAspectRatio="none" keeps each branch under its chip at any
              width; the node is a real HTML circle so it never gets squashed. */}
          <div className="relative">
            <svg
              className="h-10 w-full"
              viewBox="0 0 100 40"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {[12.5, 37.5, 62.5, 87.5].map((x) => {
                const d = `M ${x} 0 Q ${x} 22 50 40`;
                return (
                  <g key={x}>
                    {/* The static wire */}
                    <path
                      d={d}
                      fill="none"
                      stroke="currentColor"
                      className="text-muted-foreground/30"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* A gold pulse travelling source → node along the wire */}
                    <path
                      d={d}
                      fill="none"
                      stroke="currentColor"
                      className="funnel-flow text-gold"
                      strokeWidth="2"
                      strokeLinecap="round"
                      pathLength={100}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="relative isolate grid grid-cols-2 gap-4">
            {/* Convergence orb — a large gold glow behind the two outputs,
                straddling the gap, where the sources land. */}
            <span
              className="funnel-node absolute top-1/4 left-1/2 -z-10 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold opacity-40 blur-2xl"
              aria-hidden="true"
            />
            <StoneBorder>
              <div className="bg-transparent text-card-foreground relative h-44 overflow-hidden rounded-xl p-6">
              <div className="flex h-full flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-[0.55rem] font-medium tracking-[0.2em] uppercase">
                    Chapter 2
                  </span>
                  <span className="font-edition text-foreground text-[0.95rem] font-semibold leading-tight">
                    The new HTTP QUERY method
                  </span>
                </div>
                <p className="font-edition text-muted-foreground text-[0.66rem] leading-relaxed">
                  A safe, idempotent way to send a body with your queries.
                </p>
                <div className="flex flex-1 flex-col gap-1.5">
                  {lines.map((w, i) =>
                    w === null ? (
                      <span key={i} className="h-1" />
                    ) : (
                      <span
                        key={i}
                        className="bg-muted h-1.5 rounded-full"
                        style={{ width: w }}
                      />
                    ),
                  )}
                </div>
              </div>
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, var(--card), transparent)",
                }}
              />
              </div>
            </StoneBorder>
            <StoneBorder>
              <div className="bg-transparent relative h-44 overflow-hidden rounded-xl p-6">
              <div className="flex h-full flex-col gap-1.5 font-mono text-[0.6rem] leading-relaxed">
                <p className="text-foreground"># Sources</p>
                <p className="text-foreground mt-1">
                  ## The new HTTP QUERY method
                </p>
                <p className="text-muted-foreground">
                  A safe, idempotent way to send a body with your queries.
                </p>
                <p className="text-muted-foreground/70">
                  - [Original article](https://…)
                </p>
                {mdBands.map((w, i) => (
                  <span
                    key={i}
                    className="bg-muted mt-0.5 h-1.5 rounded"
                    style={{ width: w }}
                  />
                ))}
              </div>
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, var(--card), transparent)",
                }}
              />
              </div>
            </StoneBorder>
          </div>
          <figcaption className="text-muted-foreground text-center text-xs text-balance">
            Any mix of sources, one compilation, two formats: EPUB for your
            e-reader, Markdown for your AI.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

function DataAndFaq() {
  const items = [
    {
      q: "What can I put in?",
      a: "Videos, podcasts, articles and blog posts. Drop a single link, or a whole playlist, channel or blog, and it expands into its items.",
    },
    {
      q: "Is it free?",
      a: "Yes. The default path uses no AI and costs nothing. Optional cleanup or podcast transcription only cost if you connect a paid provider, or stay free with a local one.",
    },
    {
      q: "Where do my files go?",
      a: "Onto the machine running Thothly, in a local file. The only things fetched are the sources themselves.",
    },
    {
      q: "A video has no subtitles?",
      a: "It's skipped, and you'll see that flagged in review before anything is compiled.",
    },
  ];
  return (
    <section id="faq" className="scroll-mt-14 border-t px-6 py-14">
      <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl tracking-tight text-balance">
            Yours, on your machine
          </h2>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed text-balance">
            Thothly runs on your own machine. Your jobs and cached transcripts
            live in a single local file, nothing is sent to a server we run, and
            there is no tracking or analytics.
          </p>
          <ul className="text-muted-foreground marker:text-muted-foreground/40 mt-4 flex list-disc flex-col gap-2 pl-5 text-sm text-balance">
            <li>Free by default: the standard path uses no AI at all.</li>
            <li>
              AI cleanup is optional, and can run fully local (Ollama) or on a
              provider you choose.
            </li>
            <li>
              Paid steps like transcription only happen if you opt in, and are
              cached so a re-compile never pays twice.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-display text-2xl tracking-tight text-balance">
            Questions
          </h2>
          <div className="mt-4 flex flex-col">
            {items.map((it) => (
              <details key={it.q} className="group border-b py-3.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  {it.q}
                  <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-balance">
                  {it.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t px-6 py-8">
      <div className="text-muted-foreground mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 text-xs sm:flex-row">
        <Logotype className="text-foreground h-5 w-auto" title="Thothly" />
        <span>
          A personal reading compiler, built by{" "}
          <a
            href="https://wael.work"
            target="_blank"
            rel="noreferrer"
            className="text-foreground hover:text-gold focus-visible:ring-ring rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            Wael
          </a>
          .
        </span>
      </div>
    </footer>
  );
}

interface SearchResultsProps {
  searching: boolean;
  query: string;
  results: SearchResult[];
  stagedUrls: Set<string>;
  onToggle: (result: SearchResult) => void;
  // Fired on a pointer press of a row, so the parent can tell a click pick from
  // a keyboard pick and only return focus to the bar for the former.
  onPointerPick: () => void;
}

function SearchResults({
  searching,
  query,
  results,
  stagedUrls,
  onToggle,
  onPointerPick,
}: SearchResultsProps) {
  // First search in flight, with no prior results to keep on screen: stand in
  // skeleton rows that mirror the real row geometry — media tile, title line,
  // meta line — so when results land they replace the placeholders in place
  // rather than the list popping in from a stray spinner. The pulse is staggered
  // for a soft wave and stilled under reduced motion (the bars still read).
  if (searching && results.length === 0) {
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
                checked ? "bg-foreground/[0.06]" : "hover:bg-foreground/5",
              )}
            >
              <Checkbox checked={checked} onCheckedChange={() => onToggle(r)} />
              <SourceMedia kind={kind} thumbnail={r.thumbnail} />
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
                  {r.duration_s != null && (
                    <>
                      <MetaSep />
                      <SourceMetric kind="duration" className="shrink-0">
                        {formatDuration(r.duration_s)}
                      </SourceMetric>
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

function SortSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1.5 text-xs">
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
// so it's clear up front what Thothly searches: YouTube, Apple Podcasts and the
// open web. Monochrome lucide glyphs in the muted (secondary) tone — never the
// brand gold, never multicolor brand logos that would clash on the night ground.
// lucide carries no brand marks, so each source reads through its medium, in the
// same icon language the funnel uses (Play = video, podcast waves, globe = web);
// each is ringed in the panel's own sunken surface so they read as a stacked pile.
const SEARCH_SOURCES = [
  { key: "youtube", label: "YouTube", Icon: PlayIcon },
  { key: "podcast", label: "Apple Podcasts", Icon: PodcastIcon },
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
      Searches YouTube, Apple Podcasts and the web
    </p>
  );
}

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
