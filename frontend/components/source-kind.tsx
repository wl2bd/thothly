"use client";

import {
  ClockIcon,
  FileTextIcon,
  ListVideoIcon,
  MicIcon,
  PlayIcon,
  PodcastIcon,
  TvIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type ResultType } from "@/lib/api";

// ── Source presentation, shared across screens ───────────────────────────────
// One vocabulary for "what kind of thing is this source" that search, review and
// (later) compilation all read from, so a type always looks the same wherever it
// appears: same label, same icon, same text-vs-media treatment, same "weight"
// metric. Two rules the brand pins down:
//   1. Types are told apart by ICON, never by colour. The identity carries ONE
//      accent (desert gold), reserved for selection/action; multi-coloured type
//      chips would break it. The glyph alone disambiguates Video / Episode /
//      Article / Playlist.
//   2. The weight metric is icon-led so it is never ambiguous when listen-time
//      and read-time coexist: a CLOCK means time you spend playing it (video,
//      podcast), a DOC means time you spend reading it (article). Eight minutes
//      of video must never read like eight minutes of text.

export type SourceKind =
  | "video"
  | "episode"
  | "podcast"
  | "article"
  | "playlist"
  | "channel";

interface KindMeta {
  label: string;
  Icon: LucideIcon;
  // Text sources (articles, blog posts) read as a document, not a photo tile.
  text: boolean;
  // Containers (playlists, channels, blogs) hold many items but are NOT unfolded
  // at search — the item count and per-item weights are resolved at review.
  container: boolean;
}

const KIND_META: Record<SourceKind, KindMeta> = {
  video: { label: "Video", Icon: PlayIcon, text: false, container: false },
  episode: { label: "Episode", Icon: MicIcon, text: false, container: false },
  podcast: { label: "Podcast", Icon: PodcastIcon, text: false, container: false },
  article: { label: "Article", Icon: FileTextIcon, text: true, container: false },
  playlist: { label: "Playlist", Icon: ListVideoIcon, text: false, container: true },
  channel: { label: "Channel", Icon: TvIcon, text: false, container: true },
};

// Search hits speak ResultType; discovered items speak item_type. Both fold into
// the one SourceKind vocabulary so downstream screens never special-case either.
export function kindFromResultType(type: ResultType): SourceKind {
  switch (type) {
    case "video":
      return "video";
    case "episode":
      return "episode";
    case "podcast":
      return "podcast";
    case "playlist":
      return "playlist";
    case "channel":
      return "channel";
    case "web":
      return "article";
  }
}

export function kindFromItemType(
  itemType: "youtube" | "blog" | "podcast",
): SourceKind {
  return itemType === "youtube"
    ? "video"
    : itemType === "podcast"
      ? "episode"
      : "article";
}

export function isContainerKind(kind: SourceKind): boolean {
  return KIND_META[kind].container;
}

// The type chip: a plain label, stark neutral. The word alone disambiguates the
// kind — these labels are content-type terms (Video / Episode / Article), not
// provider names, so they generalize as new platforms are added and read the
// same wherever they appear: the chip here, the filter above the results.
export function SourceTypePill({
  kind,
  className,
}: {
  kind: SourceKind;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn("font-normal", className)}>
      {KIND_META[kind].label}
    </Badge>
  );
}

export function kindLabel(kind: SourceKind): string {
  return KIND_META[kind].label;
}

// A discreet vertical hairline between meta fields (type · domain · weight) so
// they don't run together. Same separator on every screen.
export function MetaSep() {
  return (
    <span
      aria-hidden="true"
      className="bg-border h-3 w-px shrink-0 self-center"
    />
  );
}

// The "weight" of a source, in one consistent slot. `duration` (clock) is play
// time; `reading` (doc) is read time. Icon-led so the two never blur together.
export function SourceMetric({
  kind,
  children,
  className,
}: {
  kind: "duration" | "reading";
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = kind === "reading" ? FileTextIcon : ClockIcon;
  return (
    <span
      className={cn("inline-flex items-center gap-1 tabular-nums", className)}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

// The image slot. Media (video/podcast/playlist) shows its thumbnail, or a media
// glyph when none is returned; a TEXT source shows a document placeholder so an
// article never masquerades as a photo tile. The brand favicon is a separate,
// inline marker (SourceFavicon), never this slot — that keeps the medium (photo
// vs document) the thing this slot communicates.
//
// `duration` (preformatted, e.g. "10:43") rides as a corner badge over the tile,
// the way every video/podcast surface shows play time — so it reads as a property
// of THIS clip, on the artwork, instead of as one more field in the meta line.
export function SourceMedia({
  kind,
  thumbnail,
  duration,
  className = "h-12 w-20",
}: {
  kind: SourceKind;
  thumbnail?: string | null;
  duration?: string | null;
  className?: string;
}) {
  const { text, Icon } = KIND_META[kind];

  return (
    <span
      className={cn(
        "bg-muted relative block shrink-0 overflow-hidden rounded",
        className,
      )}
    >
      {!text && thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- decorative remote thumbnail; per-provider host optimization isn't worth wiring
        <img
          src={thumbnail}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <span
          className="text-muted-foreground/60 flex size-full items-center justify-center"
          aria-hidden="true"
        >
          {text ? <DocumentGlyph /> : <Icon className="size-5" />}
        </span>
      )}
      {duration && (
        <span className="absolute right-1 bottom-1 rounded-[3px] bg-black/72 px-1 py-px text-[10px] leading-tight font-medium text-white tabular-nums">
          {duration}
        </span>
      )}
    </span>
  );
}

// A few short ruled lines — reads as "a document of text", distinct at a glance
// from a photo thumbnail.
function DocumentGlyph() {
  return (
    <span className="flex w-1/2 flex-col gap-[3px]">
      {["100%", "72%", "92%", "58%"].map((w, i) => (
        <span
          key={i}
          className="bg-current h-[2px] rounded-full"
          style={{ width: w }}
        />
      ))}
    </span>
  );
}

// The per-source brand marker — the site favicon, shown ALONGSIDE the domain
// text (never instead of it). Fetched keyless via DuckDuckGo's icon service; if
// it doesn't load it removes itself, leaving the domain text to carry the source.
export function SourceFavicon({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const src = faviconUrl(url);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny decorative favicon
    <img
      src={src}
      alt=""
      loading="lazy"
      className={cn("size-3.5 shrink-0 rounded-[2px]", className)}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function faviconUrl(url: string): string | null {
  const host = hostOf(url);
  return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : null;
}
