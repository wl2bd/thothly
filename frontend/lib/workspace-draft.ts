// The home workspace's list of sources and its title, kept for the browser
// session so going back (the browser's Back, or "← Sources" from a
// compilation) finds them again. sessionStorage: per tab, gone when it closes.
import type { ResultType, Source } from "@/lib/api";

export interface StagedSource {
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

export interface Draft {
  staged: StagedSource[];
  suggestedTitle: string;
  typedTitle: string | null;
}

const KEY = "thothly:draft";
const jobKey = (id: string) => `thothly:draft:${id}`;

function read(key: string): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
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
  const snapshot = read(jobKey(jobId));
  saveDraft(
    snapshot ?? {
      staged: sources.map((s) => ({
        ...stagedFromUrl(s.url),
        title: s.title || s.name || prettyUrl(s.url),
        ...(s.kind === "podcast"
          ? { type: "episode" as ResultType, source: "podcast", durationS: s.duration_s ?? null }
          : {}),
      })),
      suggestedTitle: "",
      typedTitle: bookTitle,
    },
  );
}

// A pasted link, before discovery knows anything about it.
export function stagedFromUrl(url: string): StagedSource {
  return {
    url,
    title: prettyUrl(url),
    type: detectType(url),
    source: detectSource(url),
    thumbnail: null,
    durationS: null,
    author: null,
  };
}

export function normalizeUrl(raw: string): string {
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
