// What kind of thing a source is, in the one vocabulary every screen shows.
// Search hits speak ResultType, discovered items speak ItemType and a pasted
// link speaks the backend's SourceKind; all three fold into this.
import type { ItemType, ResultType, Source } from "@/lib/api";

export type Kind = "video" | "episode" | "article" | "playlist" | "channel";

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

export const kindFromResultType = (type: ResultType): Kind => FROM_RESULT[type];
export const kindFromItemType = (type: ItemType): Kind => FROM_ITEM[type];

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
