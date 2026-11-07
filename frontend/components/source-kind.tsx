"use client";

import { useEffect, useState } from "react";
import {
  FileTextIcon,
  ListVideoIcon,
  MicIcon,
  PlayIcon,
  TvIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { Kind } from "@/lib/kinds";
import { faviconUrl } from "@/lib/url";

// ── Source presentation, shared across screens ───────────────────────────────
// One vocabulary for "what kind of thing is this source" that search and review
// read from, so a type always looks the same wherever it appears: same label,
// same icon, same text-vs-media treatment. The brand pins one rule down:
// types are told apart by ICON, never by colour. The identity carries ONE accent
// (desert gold), reserved for selection/action; multi-coloured type chips would
// break it. The glyph alone disambiguates Video / Episode / Article / Playlist.

interface KindMeta {
  label: string;
  Icon: LucideIcon;
  // Text sources (articles, blog posts) read as a document, not a photo tile.
  text: boolean;
  // Containers (playlists, channels, blogs) hold many items but are NOT unfolded
  // at search — the item count and per-item weights are resolved at review.
  container: boolean;
}

const KIND_META: Record<Kind, KindMeta> = {
  video: { label: "Video", Icon: PlayIcon, text: false, container: false },
  episode: { label: "Episode", Icon: MicIcon, text: false, container: false },
  article: { label: "Article", Icon: FileTextIcon, text: true, container: false },
  playlist: { label: "Playlist", Icon: ListVideoIcon, text: false, container: true },
  channel: { label: "Channel", Icon: TvIcon, text: false, container: true },
};

// The one display order for kinds, wherever they are listed side by side.
export const KIND_ORDER = Object.keys(KIND_META) as Kind[];

export function isContainerKind(kind: Kind): boolean {
  return KIND_META[kind].container;
}

// The type label: small tracked capitals, no chip around it. The word alone disambiguates the
// kind — these labels are content-type terms (Video / Episode / Article), not
// provider names, so they generalize as new platforms are added and read the
// same wherever they appear: the chip here, the filter above the results.
export function SourceTypePill({
  kind,
  className,
}: {
  kind: Kind;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "eyebrow",
        className,
      )}
    >
      {KIND_META[kind].label}
    </span>
  );
}

export function kindLabel(kind: Kind): string {
  return KIND_META[kind].label;
}

// A discreet vertical hairline between meta fields (type · domain) so
// they don't run together. Same separator on every screen.
export function MetaSep() {
  return (
    <span
      aria-hidden="true"
      className="bg-border h-3 w-px shrink-0 self-center"
    />
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
  url,
  className = "h-12 w-20",
}: {
  kind: Kind;
  thumbnail?: string | null;
  duration?: string | null;
  // A text source shows its site's mark when given, so ten articles from ten
  // sites don't read as ten identical placeholders.
  url?: string;
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
        <Thumbnail key={thumbnail} src={thumbnail} />
      ) : (
        <span
          className="text-muted-foreground flex size-full items-center justify-center"
          aria-hidden="true"
        >
          {text ? (
            url ? <SiteMark url={url} /> : <DocumentGlyph />
          ) : (
            <Icon className="size-5" />
          )}
        </span>
      )}
      {duration && (
        <span className="absolute right-1 bottom-1 rounded-xs bg-black/72 px-1 py-px text-3xs leading-tight font-medium text-white tabular-nums">
          {duration}
        </span>
      )}
    </span>
  );
}

// A remote thumbnail that fades in once loaded, over the muted tile.
//
// The src is set one effect after mount on purpose. When search results replace
// their skeleton, Skullet holds every <img> still loading behind an overlay it
// pins at the image's position at that instant, and lifts it only on load (or
// after 10s). Rows then shift as more providers land, the pinned overlays stay
// put, and thumbnails read as cut off until they all lift together. An <img>
// without a src counts as complete, so Skullet leaves it alone.
function Thumbnail({ src }: { src: string }) {
  const [ready, setReady] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate post-reveal src, see above
  useEffect(() => setReady(src), [src]);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative remote thumbnail; per-provider host optimization isn't worth wiring
    <img
      src={ready ?? undefined}
      alt=""
      loading="lazy"
      onLoad={() => setLoaded(true)}
      className={cn(
        "size-full object-cover transition-opacity duration-300 ease-out motion-reduce:transition-none",
        loaded ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

// The site's favicon, drawn larger, falling back to the document lines when the
// site has none.
function SiteMark({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const src = faviconUrl(url);
  if (!src || failed) return <DocumentGlyph />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny decorative favicon
    <img
      src={src}
      alt=""
      loading="lazy"
      className="size-6 rounded-sm"
      onError={() => setFailed(true)}
    />
  );
}

// A few short ruled lines — reads as "a document of text", distinct at a glance
// from a photo thumbnail.
function DocumentGlyph() {
  return (
    <span className="flex w-1/2 flex-col gap-0.75">
      {["100%", "72%", "92%", "58%"].map((w, i) => (
        <span
          key={i}
          className="bg-current h-0.5 rounded-full"
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
      className={cn("size-3.5 shrink-0 rounded-xs", className)}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}
