import Image from "next/image";

import { FileTextIcon, MicIcon, PlayIcon } from "lucide-react";

import { MetaSep } from "@/components/source-kind";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The home page at rest: what the tool does, drawn with its own parts. Three
// sources at the top (a video, a podcast episode, an article) threaded down
// into one book. Set a step back from the interface (outlines, muted ink) so it
// reads as an illustration, never as controls. Stoicism, the default, shows
// what that search really finds, with their artwork copied into /public so the
// home page calls no third party; the other topics are illustrative, drawn
// with the kind's own mark. Picking a topic under the sketch redraws it.
type SketchSource = { kind: "Video" | "Episode" | "Article"; title: string; meta: string; src?: string; media?: string };
export type SketchTopic = { topic: string; output: "EPUB" | "Markdown" | null; sources: SketchSource[] };

export const SKETCH_TOPICS: Record<string, SketchTopic> = {
  Stoicism: {
    topic: "Stoicism",
    output: null,
    sources: [
      { kind: "Video", title: "Stoicism, TED-Ed", meta: "5:30", src: "/sketch/video.jpg", media: "aspect-[4/3] [&_img]:object-cover" },
      { kind: "Episode", title: "10 Stoic principles", meta: "17:12", src: "/sketch/podcast.jpg", media: "aspect-square" },
      { kind: "Article", title: "Stoicism, Wikipedia", meta: "12 min", src: "/sketch/wikipedia.png", media: "aspect-square bg-white p-2.5" },
    ],
  },
  "The fall of Rome": {
    topic: "The fall of Rome",
    output: "EPUB",
    sources: [
      { kind: "Video", title: "Why Rome fell", meta: "14:08" },
      { kind: "Episode", title: "The last emperors", meta: "52:40" },
      { kind: "Article", title: "Fall of the Western Empire", meta: "18 min" },
    ],
  },
  "Next.js App Router": {
    topic: "Next.js App Router",
    output: "Markdown",
    sources: [
      { kind: "Video", title: "App Router in 20 minutes", meta: "20:14" },
      { kind: "Article", title: "Routing fundamentals", meta: "9 min" },
      { kind: "Article", title: "Server Components guide", meta: "14 min" },
    ],
  },
  "How transformers work": {
    topic: "How transformers work",
    output: "Markdown",
    sources: [
      { kind: "Video", title: "Attention, visually", meta: "26:10" },
      { kind: "Episode", title: "Inside a language model", meta: "41:25" },
      { kind: "Article", title: "Transformer, Wikipedia", meta: "22 min" },
    ],
  },
};

const KIND_ICON = { Video: PlayIcon, Episode: MicIcon, Article: FileTextIcon };

// Laid down like cards on a table: each source tilted and dropped a little
// (`tilt` in degrees, `drop` in px), the book barely turned. On arrival they
// fall into place one after the other, then the threads draw down to the book.
// Thread starts sit under each of the three equal columns (x in a 0-300
// viewBox, y following each card's drop), all meeting on top of the book.
const STARTS = [50, 150, 250];
const LAYOUT = [
  { tilt: -3.5, drop: 10 },
  { tilt: 1.5, drop: -4 },
  { tilt: 4, drop: 14 },
];

// Keyed on the topic by the caller: a new topic replays the arrival, the
// cards dropping in again, then the threads.
export function ToolSketch({
  example,
  onBuild,
}: {
  example: SketchTopic;
  onBuild: (topic: string) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center">
      <ul aria-hidden className="grid w-full grid-cols-3 gap-3">
        {example.sources.map(({ src, media, kind, title, meta }, i) => {
          const { tilt, drop } = LAYOUT[i];
          const Icon = KIND_ICON[kind];
          return (
          <li
            key={title}
            style={
              {
                "--tilt": `${tilt}deg`,
                "--drop": `${drop}px`,
                animationDelay: `${i * 110}ms`,
              } as React.CSSProperties
            }
            className="sketch-card border-foreground/10 bg-background/60 text-muted-foreground flex min-w-0 items-center gap-2.5 rounded-lg border p-2 text-left"
          >
            <span
              className={cn(
                "relative flex h-10 shrink-0 items-center justify-center overflow-hidden rounded-sm opacity-80 saturate-75",
                src ? media : "bg-foreground/5 aspect-square",
              )}
            >
              {src ? (
                <Image src={src} alt="" fill sizes="72px" className="object-contain" />
              ) : (
                <Icon className="text-muted-foreground/70 size-4" />
              )}
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
          );
        })}
      </ul>

      {/* The binding, drawn once on arrival; still under reduced motion. */}
      <svg aria-hidden viewBox="0 0 300 48" preserveAspectRatio="none" className="h-12 w-full overflow-visible">
        {STARTS.map((x, i) => (
          <path
            key={x}
            d={`M${x} ${LAYOUT[i].drop} C ${x} 30, 150 22, 150 48`}
            pathLength={1}
            className="sketch-thread stroke-foreground/15 fill-none"
            style={{ animationDelay: `${520 + i * 110}ms` }}
          />
        ))}
      </svg>

      {/* The book, whole, with the three ways out of it along its foot. */}
      <div className="sketch-book border-foreground/15 text-muted-foreground flex w-72 flex-col rounded-lg border px-5 pt-4 pb-4 text-left">
        <span className="eyebrow text-inherit">Compilation</span>
        <span className="font-display text-foreground/75 mt-1.5 text-lg tracking-tight">
          {example.topic}
        </span>
        <span className="text-muted-foreground/70 text-xs tabular-nums">
          3 chapters
        </span>
        <ol aria-hidden className="mt-3 flex flex-col gap-1 text-xs">
          {example.sources.map(({ title }, i) => (
            <li key={title} className="flex gap-2">
              <span className="text-muted-foreground/60 w-3 shrink-0 tabular-nums">{i + 1}</span>
              <span className="truncate">{title}</span>
            </li>
          ))}
        </ol>
        <ul aria-hidden className="border-foreground/10 mt-4 flex gap-1.5 border-t pt-3">
          {["EPUB", "Markdown", "Send to e-reader"].map((out) => (
            <li
              key={out}
              className={cn(
                "rounded-sm border px-1.5 py-0.5 text-[0.65rem] whitespace-nowrap transition-colors duration-500",
                // The way out this topic is for, lit in the action gold.
                out === example.output
                  ? "border-primary bg-primary/20 text-foreground"
                  : "border-foreground/10",
              )}
            >
              {out}
            </li>
          ))}
        </ul>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onBuild(example.topic)}
          className="mt-4 self-start"
        >
          Build this book
        </Button>
      </div>
    </div>
  );
}
