// The home workspace's list of sources and its title, kept for the browser
// session so going back (the browser's Back, or "← Sources" from a
// compilation) finds them again. sessionStorage: per tab, gone when it closes.
import type { SearchResult, Source, SourceSpec } from "@/lib/api";
import { backendKindOfUrl, kindFromResultType, kindOfUrl, type Kind } from "@/lib/kinds";
import { prettyUrl, sourceName } from "@/lib/url";
import type { FromJob } from "@/lib/job-reuse";

export interface StagedSource {
  url: string;
  title: string;
  type: Kind;
  // Which search provider it came from; "web" for a pasted page.
  source: SearchResult["source"];
  thumbnail: string | null;
  durationS: number | null;
  // A podcast episode's show feed, from the search result.
  feedUrl?: string;
  // For a podcast episode this is the show name; for other kinds it's the
  // author/channel. Kept so the Sources recap can show it (an episode's title
  // alone reads like a show name without it).
  author: string | null;
  // The search that found it; absent when it was pasted as a link.
  query?: string;
}

export interface Draft {
  staged: StagedSource[];
  suggestedTitle: string;
  typedTitle: string | null;
  // The searches that brought sources in, newest first, to go back to one.
  queries?: string[];
  // The compilation this list came back from ("← Sources"), so Review can
  // reopen it when nothing changed instead of making a twin.
  fromJob?: FromJob;
}

const KEY = "thothly:draft";
const jobKey = (id: string) => `thothly:draft:${id}`;

function read(key: string): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    // A draft saved before kinds had two axes stored a bare word: read it again.
    for (const s of draft.staged) {
      if (typeof s.type === "string") {
        s.type =
          s.source === "podcast" ? { medium: "audio", collection: false } : kindOfUrl(s.url);
      }
    }
    return draft;
  } catch {
    return null;
  }
}

function write(key: string, draft: Draft | null) {
  try {
    if (draft && draft.staged.length > 0) window.sessionStorage.setItem(key, JSON.stringify(draft));
    else window.sessionStorage.removeItem(key);
  } catch {
    /* storage blocked: the workspace just starts empty */
  }
}

export const loadDraft = () => read(KEY);
export const saveDraft = (draft: Draft) => write(KEY, draft);
export const clearDraft = () => write(KEY, null);

// The list a compilation was launched from, so its "← Sources" link can put it
// back exactly (thumbnails and all), even after the workspace moved on.
export const saveJobDraft = (jobId: string, draft: Draft) => write(jobKey(jobId), draft);

// Back from a compilation to the workspace: its own snapshot when this tab
// launched it, otherwise rebuilt from what the job knows about its sources.
export function restoreJobDraft(jobId: string, sources: Source[], bookTitle: string | null) {
  const draft = read(jobKey(jobId)) ?? {
    staged: sources.map(stagedFromSource),
    suggestedTitle: "",
    typedTitle: bookTitle,
  };
  saveDraft({
    ...draft,
    fromJob: {
      id: jobId,
      urls: draft.staged.map((s) => s.url),
      title: draft.typedTitle ?? draft.suggestedTitle,
    },
  });
}

// A search hit, picked.
export function stagedFromResult(r: SearchResult, query: string | undefined): StagedSource {
  return {
    url: r.url,
    title: r.title,
    type: kindFromResultType(r.type, r.url),
    source: r.source,
    thumbnail: r.thumbnail ?? null,
    durationS: r.duration_s ?? null,
    feedUrl: typeof r.meta?.feed_url === "string" ? r.meta.feed_url : undefined,
    author: r.author ?? null,
    query,
  };
}

// A pasted link, before discovery knows anything about it.
export function stagedFromUrl(url: string): StagedSource {
  const kind = kindOfUrl(url);
  return {
    url,
    title: prettyUrl(url),
    type: kind,
    source: kind.medium === "audio" ? "podcast" : backendKindOfUrl(url).startsWith("youtube") ? "youtube" : "web",
    thumbnail: null,
    durationS: null,
    author: null,
  };
}

// What the backend is asked to discover. A picked episode names its kind (its
// audio URL isn't always self-identifying) and carries what only the search
// knew: length and feed. Every other kind is left to the URL, which the backend
// reads the way kindOfUrl does. The title is the one the visitor saw, so the
// loading screen can name each source.
export function toSourceSpec(s: StagedSource): SourceSpec {
  return s.source === "podcast"
    ? {
        url: s.url,
        kind: "podcast",
        title: s.title,
        duration_s: s.durationS ?? undefined,
        feed_url: s.feedUrl,
        query: s.query,
      }
    : { url: s.url, title: s.title, query: s.query };
}

function stagedFromSource(s: Source): StagedSource {
  const staged = stagedFromUrl(s.url);
  return {
    ...staged,
    // The title the visitor picked from the results first: the page's own
    // name, read during discovery, is often "Article | Site".
    title: s.title?.trim() || sourceName(s),
    ...(s.kind === "podcast"
      ? { type: { medium: "audio", collection: false }, source: "podcast", durationS: s.duration_s ?? null, feedUrl: s.feed_url ?? undefined }
      : {}),
  };
}

export function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (t === "") return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}
