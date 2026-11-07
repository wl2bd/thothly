// What kind of thing a source is, in the one vocabulary every screen shows.
// Search hits speak ResultType, discovered items speak ItemType and a pasted
// link speaks the backend's SourceKind; all three fold into this.
import type { ItemType, ResultType, Source } from "@/lib/api";
import { webKind } from "./web-kind.ts";

// A web link is split further by its URL (see lib/web-kind.ts): "Article" alone
// would also cover homes that unfold into many posts, encyclopedia entries,
// Q&A threads and docs.
export type Kind =
  | "video"
  | "episode"
  | "article"
  | "encyclopedia"
  | "discussion"
  | "page"
  | "site"
  | "playlist"
  | "channel";

type BackendKind = NonNullable<Source["kind"]>;

const FROM_BACKEND: Record<BackendKind, Kind> = {
  youtube_video: "video",
  youtube_playlist: "playlist",
  youtube_channel: "channel",
  podcast: "episode",
  blog: "article",
};

const FROM_RESULT: Record<ResultType, Kind> = { video: "video", episode: "episode", web: "article" };

const FROM_ITEM: Record<ItemType, Kind> = { youtube: "video", podcast: "episode", blog: "article" };

export const kindFromResultType = (type: ResultType, url?: string): Kind =>
  type === "web" && url ? webKind(url) : FROM_RESULT[type];

// A discovered item is one page already: a site's home has been unfolded into
// its posts by now, so a lone home here is read as a page.
export function kindFromItemType(type: ItemType, url?: string): Kind {
  if (type !== "blog" || !url) return FROM_ITEM[type];
  const kind = webKind(url);
  return kind === "site" ? "page" : kind;
}

// The same reading as the backend's detect_kind; fixtures/url-kinds.json holds
// the cases both sides are tested against.
const VIDEO_ID = /(?:[?&]v=|youtu\.be\/|youtube\.com\/(?:shorts|live|embed)\/)([A-Za-z0-9_-]{6,})/;
const AUDIO = /\.(mp3|m4a|aac|ogg|opus|wav)$/;

export function backendKindOfUrl(url: string): BackendKind {
  const u = url.toLowerCase();
  if ((u.includes("youtube.com/watch") && u.includes("v=")) || VIDEO_ID.test(url)) return "youtube_video";
  if (u.includes("list=") || u.includes("youtube.com/playlist")) return "youtube_playlist";
  if (/youtube\.com\/(@|channel\/|c\/|user\/)/.test(u)) return "youtube_channel";
  let path = "";
  try {
    path = new URL(u).pathname;
  } catch {
    /* not a URL: read as a page */
  }
  if (AUDIO.test(path)) return "podcast";
  return "blog";
}

export const kindOfUrl = (url: string): Kind => FROM_BACKEND[backendKindOfUrl(url)];
