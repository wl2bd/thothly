"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  createJob,
  search,
  type ProviderError,
  type ResultType,
  type SearchResult,
} from "@/lib/api";

// A source the user has staged for compilation. Built either from a picked
// search result or from a directly-pasted link.
interface StagedSource {
  url: string;
  title: string;
  type: ResultType;
  source: string;
  thumbnail: string | null;
  durationS: number | null;
}

const SEARCH_DEBOUNCE_MS = 350;

export default function Home() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchErrors, setSearchErrors] = useState<ProviderError[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Which provider's results to show ("all" = no filter), and how to order them
  // ("relevance" = the backend's cross-provider ranking). Both reset on every
  // new search so stale controls never blank out or mis-order the next query.
  const [sourceFilter, setSourceFilter] = useState<string>("all");
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
        setSourceFilter("all");
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
        setSourceFilter("all");
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

  function toggleResult(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  function addSelectedToSources() {
    const picked = results
      .filter((r) => selected.has(r.id))
      .map((r) => ({
        url: r.url,
        title: r.title,
        type: r.type,
        source: r.source,
        thumbnail: r.thumbnail,
        durationS: r.duration_s,
      }));
    stageSources(picked);
    setSelected(new Set());
    setQuery("");
    setResults([]);
    setSearchErrors([]);
  }

  // Enter on a pasted link adds it straight to the sources, keeping the bar
  // backward-compatible with the old paste-a-URL flow. Enter on a search term
  // does nothing — results are picked via their checkboxes.
  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (trimmed === "" || !queryIsUrl) return;
    const url = normalizeUrl(trimmed);
    stageSources([
      {
        url,
        title: prettyUrl(url),
        type: detectType(url),
        source: detectSource(url),
        thumbnail: null,
        durationS: null,
      },
    ]);
    setQuery("");
  }

  function removeStaged(url: string) {
    setStaged((prev) => prev.filter((s) => s.url !== url));
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
    sourceFilter === "all"
      ? results
      : results.filter((r) => r.source === sourceFilter);
  const visibleResults = sortResults(filteredResults, sortBy);

  return (
    <main className="flex min-h-screen justify-center p-8 sm:p-12">
      <div className="flex w-full max-w-2xl flex-col gap-10 py-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <h1 className="font-heading text-5xl font-semibold tracking-tight text-foreground">
            Thothly
          </h1>
          <p className="text-muted-foreground max-w-md text-pretty text-[0.95rem] leading-relaxed">
            Search YouTube — or paste a link — and pick what goes into a polished
            EPUB for your e-reader.
          </p>
        </header>

        <Card>
          <CardContent className="flex flex-col gap-5">
            <form onSubmit={onSubmit} className="flex flex-col gap-2">
              <div className="relative">
                <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search or paste a link…"
                  className="pl-9"
                  autoFocus
                />
              </div>
              {queryIsUrl && (
                <p className="text-muted-foreground px-1 text-xs">
                  Looks like a link — press{" "}
                  <kbd className="rounded border px-1 font-mono">Enter</kbd> to add
                  it to your sources.
                </p>
              )}
            </form>

            {error && <p className="text-destructive text-sm">{error}</p>}

            {searchErrors.length > 0 && (
              <p className="text-amber-700 dark:text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2 text-xs">
                {searchErrors.map((e) => e.provider).join(", ")} unavailable —
                showing the other results.
              </p>
            )}

            {showResults && results.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <SourceFilter
                  results={results}
                  active={sourceFilter}
                  onChange={setSourceFilter}
                />
                <SortSelect value={sortBy} onChange={setSortBy} />
              </div>
            )}

            {showResults && (
              <SearchResults
                searching={searching}
                results={visibleResults}
                selected={selected}
                onToggle={toggleResult}
              />
            )}

            {selected.size > 0 && (
              <div className="flex items-center justify-between gap-2 border-t pt-4">
                <p className="text-sm font-medium">{selected.size} selected</p>
                <Button type="button" size="sm" onClick={addSelectedToSources}>
                  Add to sources
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {staged.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Sources · {staged.length}
            </h2>
            <ul className="flex flex-col gap-2">
              {staged.map((s) => (
                <li
                  key={s.url}
                  className="bg-card flex items-center gap-3 rounded-lg border px-3 py-2.5"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm">{s.title}</span>
                    <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
                      <SourceBadge source={s.source} />
                      {s.type !== s.source && <TypeBadge type={s.type} />}
                      {expandsToMany(s.type) && (
                        <span>· expands to multiple sources</span>
                      )}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeStaged(s.url)}
                    aria-label="Remove source"
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>

            <Button
              size="lg"
              onClick={onCompile}
              disabled={submitting}
              className="w-full"
            >
              {submitting
                ? "Starting…"
                : `Discover ${staged.length} source${staged.length !== 1 ? "s" : ""}`}
            </Button>
          </section>
        )}

        {staged.length === 0 && trimmed === "" && (
          <p className="text-muted-foreground text-center text-sm">
            Paste a link or type a search to get started.
          </p>
        )}
      </div>
    </main>
  );
}

interface SearchResultsProps {
  searching: boolean;
  results: SearchResult[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

function SearchResults({
  searching,
  results,
  selected,
  onToggle,
}: SearchResultsProps) {
  if (searching && results.length === 0) {
    return (
      <div className="text-muted-foreground flex items-center gap-3 py-6 text-sm">
        <Spinner />
        Searching…
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        No results.
      </p>
    );
  }

  return (
    <ul className="-mx-2 flex max-h-[55vh] flex-col overflow-y-auto">
      {results.map((r) => {
        const checked = selected.has(r.id);
        return (
          <li key={r.id}>
            <label className="hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors">
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(r.id)}
              />
              <Thumbnail result={r} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="line-clamp-2 text-sm leading-snug">
                  {r.title}
                </span>
                <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                  <SourceBadge source={r.source} />
                  {r.type !== r.source && <TypeBadge type={r.type} />}
                  {r.author && <span>· {r.author}</span>}
                  {resultExtent(r) && <span>· {resultExtent(r)}</span>}
                </span>
                <span className="text-muted-foreground/70 truncate text-xs">
                  {displayUrl(r.url)}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function Thumbnail({ result }: { result: SearchResult }) {
  if (result.thumbnail) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- decorative remote thumbnail; Next's optimizer isn't worth wiring per provider host
      <img
        src={result.thumbnail}
        alt=""
        loading="lazy"
        className="bg-muted h-12 w-20 shrink-0 rounded object-cover"
      />
    );
  }
  // Web hits carry no image; show the site's favicon (keyless, via DuckDuckGo's
  // icon service) centered in the same slot so the row still reads visually.
  const favicon = faviconUrl(result.url);
  if (favicon) {
    return (
      <span className="bg-muted flex h-12 w-20 shrink-0 items-center justify-center rounded">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny decorative favicon */}
        <img
          src={favicon}
          alt=""
          loading="lazy"
          className="size-6 rounded-sm"
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
      </span>
    );
  }
  return <span className="bg-muted h-12 w-20 shrink-0 rounded" />;
}

function faviconUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : null;
  } catch {
    return null;
  }
}

// Provider filter chips above the results — the relevant filter dimension for
// search hits (date/length aren't reliably present across providers). Only
// shown when more than one provider returned hits; counts are per provider.
function SourceFilter({
  results,
  active,
  onChange,
}: {
  results: SearchResult[];
  active: string;
  onChange: (source: string) => void;
}) {
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.source] = (counts[r.source] ?? 0) + 1;
  const sources = Object.keys(counts);
  if (sources.length < 2) return null;

  const chips = [
    { key: "all", label: "All", count: results.length },
    ...sources.map((s) => ({
      key: s,
      label: SOURCE_LABELS[s] ?? s,
      count: counts[s],
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

function SourceBadge({ source }: { source: string }) {
  return (
    <Badge variant="secondary" className="font-normal">
      {SOURCE_LABELS[source] ?? source}
    </Badge>
  );
}

function TypeBadge({ type }: { type: ResultType }) {
  return <Badge className="bg-foreground/5 text-foreground font-normal">{TYPE_LABELS[type]}</Badge>;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  youtube: "YouTube",
  podcast: "Podcast",
  web: "Web",
};

const TYPE_LABELS: Record<ResultType, string> = {
  video: "Video",
  playlist: "Playlist",
  channel: "Channel",
  podcast: "Podcast",
  episode: "Episode",
  web: "Web",
};

function expandsToMany(type: ResultType): boolean {
  return type === "playlist" || type === "channel";
}

// A short, human extent for the card: a playlist's video count, a video's
// duration. Channels just read "Channel" via the type badge.
function resultExtent(r: SearchResult): string | null {
  if (r.type === "playlist") {
    const count = r.meta?.item_count;
    return typeof count === "number" ? `${count} videos` : null;
  }
  return formatDuration(r.duration_s);
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

// The result's URL shown under its title, minus the protocol/www noise but
// keeping the path and query — so YouTube watch links (which differ only in
// ?v=…) stay distinguishable. Long URLs are truncated by the row's CSS.
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "");
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
