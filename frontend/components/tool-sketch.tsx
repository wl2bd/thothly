import Image from "next/image";

import { MetaSep } from "@/components/source-kind";
import { cn } from "@/lib/utils";

// The home page at rest: what the tool does, drawn with its own parts. Three
// real sources at the top (a video, a podcast episode, an article, with their
// own artwork), threaded down into one book that fades into the search field
// below it. Set a step back from the interface (outlines, muted ink) so it
// reads as an illustration, never as controls. Decorative, so hidden from
// assistive tech: the catchline above already says it. The images are copies
// in /public, so the home page calls no third party.
const SOURCES = [
  {
    src: "/sketch/video.jpg",
    media: "aspect-[4/3] [&_img]:object-cover",
    kind: "Video",
    title: "Stoicism, TED-Ed",
    meta: "5:30",
  },
  {
    src: "/sketch/podcast.jpg",
    media: "aspect-square",
    kind: "Episode",
    title: "10 Stoic principles",
    meta: "17:12",
  },
  {
    src: "/sketch/wikipedia.png",
    media: "aspect-square bg-white p-2.5",
    kind: "Article",
    title: "Stoicism, Wikipedia",
    meta: "12 min",
  },
];

// Thread starts under each of the three equal columns (x in a 0-300 viewBox),
// all meeting in the middle, on top of the book.
const STARTS = [50, 150, 250];

export function ToolSketch() {
  return (
    <div aria-hidden className="mx-auto flex w-full max-w-xl flex-col items-center">
      <ul className="grid w-full grid-cols-3 gap-3">
        {SOURCES.map(({ src, media, kind, title, meta }) => (
          <li
            key={kind}
            className="border-foreground/10 text-muted-foreground flex min-w-0 items-center gap-2.5 rounded-lg border p-2 text-left"
          >
            <span
              className={cn(
                "relative h-10 shrink-0 overflow-hidden rounded-sm opacity-80 saturate-75",
                media,
              )}
            >
              <Image src={src} alt="" fill sizes="72px" className="object-contain" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-xs">{title}</span>
              <span className="text-muted-foreground/70 flex items-center gap-1.5 text-xs tabular-nums">
                <span className="eyebrow text-inherit">{kind}</span>
                <MetaSep />
                {meta}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {/* The binding, drawn once on arrival; still under reduced motion. */}
      <svg viewBox="0 0 300 48" preserveAspectRatio="none" className="h-12 w-full overflow-visible">
        {STARTS.map((x, i) => (
          <path
            key={x}
            d={`M${x} 0 C ${x} 26, 150 22, 150 48`}
            pathLength={1}
            className="sketch-thread stroke-foreground/15 fill-none"
            style={{ animationDelay: `${150 + i * 120}ms` }}
          />
        ))}
      </svg>

      {/* The book: its top only, fading out toward the field it comes from. */}
      <div className="border-foreground/15 text-muted-foreground flex h-36 w-64 flex-col rounded-t-lg border border-b-0 px-5 pt-4 text-left [mask-image:linear-gradient(to_bottom,#000_45%,transparent)]">
        <span className="eyebrow text-inherit">Compilation</span>
        <span className="font-display text-foreground/75 mt-1.5 text-lg tracking-tight">
          Stoicism
        </span>
        <span className="text-muted-foreground/70 text-xs tabular-nums">
          3 chapters · EPUB · Markdown
        </span>
        <ol className="mt-3 flex flex-col gap-1 text-xs">
          {SOURCES.map(({ title }, i) => (
            <li key={title} className="flex gap-2">
              <span className="text-muted-foreground/60 w-3 shrink-0 tabular-nums">{i + 1}</span>
              <span className="truncate">{title}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
