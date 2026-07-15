"use client";

import { FileTextIcon, ListIcon, MicIcon, PlayIcon } from "lucide-react";

import { EpubTablet, MarkdownTablet } from "@/components/output-tablet";
import { cn } from "@/lib/utils";
import { useReveal } from "@/lib/use-reveal";

// Its own client island: the content below is static, but the scroll-in
// entrance needs an IntersectionObserver. `useReveal` starts `shown` true, so
// the server render is already the final, visible state — the island only ever
// enhances it.
export function HowItWorks() {
  // The figure plays a single scroll-in entrance, then rests — no perpetual
  // motion. `shown` gates the fade+rise of the chips, node and tablets and the
  // wipe-in of the funnel wires; it starts true so the server / reduced-motion
  // render is the final, visible state.
  const { ref: figureRef, shown } = useReveal<HTMLElement>();
  const rise =
    "transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";
  const riseIn = shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2";
  const steps = [
    {
      n: 1,
      title: "Add your sources",
      body: "Search, or paste any link: a video, a podcast, an article, even a whole playlist or blog.",
    },
    {
      n: 2,
      title: "Pick what goes in",
      body: "Everything's pre-selected. Uncheck what you don't want, and preview any item before you commit.",
    },
    {
      n: 3,
      title: "Get your compilation",
      body: "A polished EPUB for your e-reader, plus a Markdown twin to feed an AI.",
    },
  ];
  // Mixed input kinds, shown flowing into the two output formats below.
  const sources = [
    { Icon: PlayIcon, kind: "Video" },
    { Icon: MicIcon, kind: "Podcast" },
    { Icon: FileTextIcon, kind: "Article" },
    { Icon: ListIcon, kind: "Playlist" },
  ];
  return (
    <section id="how-it-works" className="scroll-mt-14 border-t px-6 py-14">
      <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-2 lg:items-start">
        <div>
          <h2 className="font-display text-2xl tracking-tight text-balance">
            How it works
          </h2>
          <ol className="mt-6 flex flex-col gap-5">
            {steps.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="text-muted-foreground/50 text-xl font-semibold tabular-nums">
                  {s.n}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-balance">
                    {s.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed text-balance">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <figure
          ref={figureRef}
          data-reveal={shown ? "shown" : "hidden"}
          className="bg-muted flex flex-col gap-2 rounded-2xl border p-6"
        >
          <div className="grid grid-cols-4 gap-2">
            {sources.map((s, i) => (
              <div
                key={s.kind}
                className={cn(
                  "bg-secondary flex flex-col items-center gap-1 rounded-lg border px-1 py-2",
                  rise,
                  riseIn,
                )}
                style={{ transitionDelay: shown ? `${i * 60}ms` : "0ms" }}
              >
                <s.Icon className="text-muted-foreground size-4" />
                <span className="text-muted-foreground text-[0.55rem] leading-none">
                  {s.kind}
                </span>
              </div>
            ))}
          </div>

          {/* The wiring: four sources gather into one compilation node, which
              then splits into the two output formats below — the product's whole
              move (many in, one compilation, two formats) drawn in a single
              figure. Direction reads from a STATIC gold gradient along each wire
              (muted at the source/output end, gold at the node), not from
              looping motion. preserveAspectRatio="none" keeps every wire under
              its chip / over its tablet at any width; the node is real HTML so it
              never gets squashed. On scroll-in the wires wipe in once, top →
              bottom (source → node → formats), via a clip-path on the svg (see
              the .funnel-svg rule), then rest — stroke-dash draw is unreliable on
              a non-scaling stroke under preserveAspectRatio="none". */}
          <div className="relative -my-1">
            <svg
              className="funnel-svg h-16 w-full"
              viewBox="0 0 100 48"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id="funnel-converge"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="24"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0" stopColor="var(--muted-foreground)" stopOpacity="0.32" />
                  <stop offset="1" stopColor="var(--gold)" stopOpacity="0.95" />
                </linearGradient>
                <linearGradient
                  id="funnel-diverge"
                  x1="0"
                  y1="24"
                  x2="0"
                  y2="48"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0" stopColor="var(--gold)" stopOpacity="0.95" />
                  <stop offset="1" stopColor="var(--muted-foreground)" stopOpacity="0.26" />
                </linearGradient>
              </defs>
              {/* Sources → node */}
              {[12.5, 37.5, 62.5, 87.5].map((x) => (
                <path
                  key={`c-${x}`}
                  d={`M ${x} 0 Q ${x} 15 50 24`}
                  fill="none"
                  stroke="url(#funnel-converge)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {/* Node → two formats */}
              {[25, 75].map((x) => (
                <path
                  key={`d-${x}`}
                  d={`M 50 24 Q 50 37 ${x} 48`}
                  fill="none"
                  stroke="url(#funnel-diverge)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            {/* The compilation node — a crisp concentric "nucleus": a gold core
                inside a thin gold ring, so it reads as a deliberate mark on both
                grounds without leaning on a glow. The soft halo behind it is
                STATIC (no pulse) and mode-aware — a whisper on the stark light
                page, stepped up on the night ground where the metal is meant to
                sing. Scales in with the wires rather than translating (translate
                would fight the centering transform). */}
            <span
              className="pointer-events-none absolute top-[50%] left-1/2 -translate-x-1/2 -translate-y-1/2"
              aria-hidden="true"
            >
              <span
                className={cn(
                  "relative block transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                  shown ? "scale-100 opacity-100" : "scale-90 opacity-0",
                )}
                style={{ transitionDelay: shown ? "560ms" : "0ms" }}
              >
                <span className="bg-gold/15 dark:bg-gold/30 absolute top-1/2 left-1/2 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full blur-lg dark:size-16 dark:blur-xl" />
                <span className="border-gold/45 relative flex size-4 items-center justify-center rounded-full border">
                  <span className="bg-gold size-2 rounded-full" />
                </span>
              </span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div
              className={cn(rise, riseIn)}
              style={{ transitionDelay: shown ? "700ms" : "0ms" }}
            >
              <EpubTablet />
            </div>
            <div
              className={cn(rise, riseIn)}
              style={{ transitionDelay: shown ? "780ms" : "0ms" }}
            >
              <MarkdownTablet />
            </div>
          </div>

          <figcaption
            className={cn(
              "text-muted-foreground mt-1 text-center text-xs text-balance",
              rise,
              riseIn,
            )}
            style={{ transitionDelay: shown ? "900ms" : "0ms" }}
          >
            Any mix of sources, one compilation, two formats: EPUB for your
            e-reader, Markdown for your AI.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
