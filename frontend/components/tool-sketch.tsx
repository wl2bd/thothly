import { FileTextIcon, MicIcon, PlayIcon, type LucideIcon } from "lucide-react";

import { MetaSep } from "@/components/source-kind";

// The home page at rest: what the tool does, drawn with its own parts. Three
// kinds of source on the left, bound by hairlines into one book on the right.
// Real-looking content, not placeholder bars; decorative, so hidden from
// assistive tech (the catchline above already says it).
const SOURCES: { Icon: LucideIcon; kind: string; title: string; meta: string }[] = [
  { Icon: PlayIcon, kind: "Video", title: "The philosophy of Stoicism", meta: "5:30" },
  { Icon: MicIcon, kind: "Episode", title: "10 Stoic principles", meta: "17:12" },
  { Icon: FileTextIcon, kind: "Article", title: "Stoicism, Wikipedia", meta: "12 min read" },
];

// Card centres on the left, in px of the 224px-tall column (three 64px cards,
// 16px apart), and the one point they all bind into: the book's middle.
const ROWS = [32, 112, 192];
const SPINE_Y = 112;

export function ToolSketch() {
  return (
    <div
      aria-hidden
      className="mx-auto grid w-full max-w-2xl grid-cols-[minmax(0,15rem)_minmax(3rem,1fr)_minmax(0,13rem)] items-center"
    >
      <ul className="flex flex-col gap-4">
        {SOURCES.map(({ Icon, kind, title, meta }) => (
          <li
            key={kind}
            className="bg-card shadow-surface flex h-16 items-center gap-3 rounded-lg border px-3.5"
          >
            <Icon className="text-muted-foreground size-4 shrink-0" />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-sm">{title}</span>
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
                <span className="eyebrow">{kind}</span>
                <MetaSep />
                {meta}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {/* The binding: each source's thread runs into the spine. Drawn once on
          arrival; still under reduced motion. */}
      <svg viewBox="0 0 100 224" preserveAspectRatio="none" className="h-56 w-full overflow-visible">
        {ROWS.map((y, i) => (
          <path
            key={y}
            d={`M0 ${y} C 55 ${y}, 45 ${SPINE_Y}, 100 ${SPINE_Y}`}
            pathLength={1}
            className="sketch-thread stroke-foreground/25 fill-none"
            style={{ animationDelay: `${150 + i * 120}ms` }}
          />
        ))}
      </svg>

      <div className="bg-card shadow-surface flex aspect-[4/5] flex-col rounded-lg border px-5 py-5">
        <span className="eyebrow">Compilation</span>
        <span className="font-display mt-2 text-xl tracking-tight">Stoicism</span>
        <span className="text-muted-foreground text-xs tabular-nums">3 chapters · ~8,700 words</span>
        <ol className="mt-4 flex flex-col gap-1.5 text-xs">
          {SOURCES.map(({ title }, i) => (
            <li key={title} className="flex gap-2">
              <span className="text-muted-foreground w-3 shrink-0 tabular-nums">{i + 1}</span>
              <span className="truncate">{title}</span>
            </li>
          ))}
        </ol>
        <span className="text-muted-foreground mt-auto flex items-center gap-1.5">
          <span className="eyebrow">EPUB</span>
          <MetaSep />
          <span className="eyebrow">Markdown</span>
        </span>
      </div>
    </div>
  );
}
