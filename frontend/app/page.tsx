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
}

const SEARCH_DEBOUNCE_MS = 350;

export default function Home() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchErrors, setSearchErrors] = useState<ProviderError[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const resp = await search(trimmed, controller.signal);
        if (cancelled) return;
        setResults(resp.results);
        setSearchErrors(resp.errors);
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
            ? { url: s.url, kind: "podcast", title: s.title }
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

            {showResults && (
              <SearchResults
                searching={searching}
                results={results}
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
                      <TypeBadge type={s.type} />
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
                  <TypeBadge type={r.type} />
                  {r.author && <span>· {r.author}</span>}
                  {resultExtent(r) && <span>· {resultExtent(r)}</span>}
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
  if (!result.thumbnail) {
    return <span className="bg-muted h-12 w-20 shrink-0 rounded" />;
  }
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

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}
