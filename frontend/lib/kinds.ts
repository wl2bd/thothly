// What kind of thing a source is, in the one vocabulary every screen shows.
// Search hits speak ResultType, discovered items speak ItemType and a pasted
// link speaks the backend's SourceKind; all three fold into this.
//
// Two independent questions, both answerable for sure without fetching:
//   medium      how the text is obtained: a video's captions, an audio's
//               transcription, or a page's own text
//   collection  whether it unfolds into many items at review (a playlist, a
//               channel, a site's home)
// A web page's genre (encyclopedia, forum, blog post) is deliberately not one:
// guessed from the URL alone it was often wrong, and it changes nothing in the
// compilation.
import type { ItemType, ResultType, Source } from "@/lib/api";
import { isSiteHome } from "./site-home.ts";

export type Medium = "video" | "audio" | "text";

export interface Kind {
  medium: Medium;
  collection: boolean;
}

type BackendKind = NonNullable<Source["kind"]>;

function fromBackend(kind: BackendKind, url: string): Kind {
  switch (kind) {
    case "youtube_video":
      return { medium: "video", collection: false };
    case "youtube_playlist":
    case "youtube_channel":
      return { medium: "video", collection: true };
    case "podcast":
      return { medium: "audio", collection: false };
    case "blog":
      return { medium: "text", collection: isSiteHome(url) };
  }
}

export function kindFromResultType(type: ResultType, url?: string): Kind {
  if (type === "episode") return { medium: "audio", collection: false };
  if (type === "web") return { medium: "text", collection: url ? isSiteHome(url) : false };
  // A video search can return a playlist or a channel: its URL says which.
  return { medium: "video", collection: url ? fromBackend(backendKindOfUrl(url), url).collection : false };
}

// A discovered item is one item already: containers have been unfolded by now.
const ITEM_MEDIUM: Record<ItemType, Medium> = { youtube: "video", podcast: "audio", blog: "text" };

export const kindFromItemType = (type: ItemType): Kind => ({ medium: ITEM_MEDIUM[type], collection: false });

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

export const kindOfUrl = (url: string): Kind => fromBackend(backendKindOfUrl(url), url);
