import Image from "next/image";

import { MetaSep } from "@/components/source-kind";
import { cn } from "@/lib/utils";

// The home page at rest: what the tool does, drawn with its own parts. Three
// real sources at the top (a video, a podcast episode, an article, with their
// own artwork, what the "Stoicism" example finds), threaded down into one book.
// Set a step back from the interface (outlines, muted ink) so it
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
    tilt: -3.5,
    drop: 10,
  },
  {
    src: "/sketch/podcast.jpg",
    media: "aspect-square",
    kind: "Episode",
    title: "10 Stoic principles",
    meta: "17:12",
    tilt: 1.5,
    drop: -4,
  },
  {
    src: "/sketch/wikipedia.png",
    media: "aspect-square bg-white p-2.5",
    kind: "Article",
    title: "Stoicism, Wikipedia",
    meta: "12 min",
    tilt: 4,
    drop: 14,
  },
];

// Laid down like cards on a table: each source tilted and dropped a little
// (`tilt` in degrees, `drop` in px), the book barely turned. On arrival they
// fall into place one after the other, then the threads draw down to the book.
// Thread starts sit under each of the three equal columns (x in a 0-300
// viewBox, y following each card's drop), all meeting on top of the book.
const STARTS = [50, 150, 250];

const SHEET =
  "border-input bg-card text-muted-foreground absolute top-0 flex h-80 flex-col overflow-hidden rounded-t-lg border-x border-t px-5 pt-4 text-left shadow-[0_1px_2px_rgb(0_0_0/0.06),0_10px_24px_-14px_rgb(0_0_0/0.25)] dark:shadow-[0_10px_24px_-14px_rgb(0_0_0/0.8)]";

// The sheet in front casts its shadow sideways onto the two behind it.
const FRONT =
  "shadow-[-16px_0_26px_-12px_rgb(0_0_0/0.3),16px_0_26px_-12px_rgb(0_0_0/0.3)] dark:shadow-[-18px_0_28px_-10px_rgb(0_0_0/0.85),18px_0_28px_-10px_rgb(0_0_0/0.85)]";

// The sheets lie on the table, seen at an angle.
// The fade sits on the whole group, so a sheet in front hides the ones behind.
const ANGLE =
  "[transform:perspective(900px)_rotateX(24deg)_rotate(-1.5deg)] origin-top [mask-image:linear-gradient(to_bottom,black_15%,transparent_70%)]";

const P1 =
  "Stoicism began in Athens, where Zeno of Citium taught from a painted porch. Its promise was plain: we do not choose what happens to us, only how we answer it.";
const P2 =
  "The first principle is to sort what is up to us from what is not. Opinion, intention and desire are ours; the body, reputation and fortune are not.";
const P3 =
  "Epictetus, born a slave, made this the heart of his teaching. Marcus Aurelius wrote it down again, night after night, as a note to himself.";

function RawSheet({ className }: { className?: string }) {
  return (
    <div className={cn(SHEET, "font-sans", className)}>
      <span className="text-foreground text-sm">Stoicism</span>
      <span className="mt-3 text-xs">Stoicism, TED-Ed</span>
      <p className="mt-1.5 text-xs leading-relaxed">{P1}</p>
      <span className="mt-3 text-xs">10 Stoic principles</span>
      <p className="mt-1.5 text-xs leading-relaxed">{P2}</p>
      <p className="mt-1.5 text-xs leading-relaxed">{P3}</p>
    </div>
  );
}

function MarkdownSheet({ className }: { className?: string }) {
  return (
    <div className={cn(SHEET, "font-mono text-3xs leading-relaxed", className)}>
      <span className="text-foreground"># Stoicism</span>
      <span className="mt-3 text-foreground">## 1. Stoicism, TED-Ed</span>
      <span className="text-muted-foreground">&gt; source: youtube.com/watch?v=…</span>
      <p className="mt-2">{P1}</p>
      <span className="mt-3 text-foreground">## 2. 10 Stoic principles</span>
      <p className="mt-2">
        - **Dichotomy of control**: sort what is up to us from what is not.
      </p>
      <p className="mt-1">- **Premeditatio malorum**: rehearse the worst, calmly.</p>
    </div>
  );
}

function BookSheet({ className }: { className?: string }) {
  return (
    <div className={cn(SHEET, "px-6 pt-5", className)}>
      <span className="eyebrow text-3xs! text-inherit">Chapter 1</span>
      <span className="font-display text-foreground mt-1 text-lg tracking-tight">
        The painted porch
      </span>
      <p className="mt-3 text-xs leading-relaxed">
        <span className="font-display text-foreground float-left mt-0.5 mr-1.5 text-4xl leading-[0.8]">
          S
        </span>
        {P1.slice(1)} The idea returns in every source of this book{" "}
        <span className="text-foreground underline decoration-current/40 underline-offset-2">
          (see ch. 3)
        </span>
        .
      </p>
      <p className="mt-2 indent-4 text-xs leading-relaxed">
        {P3}{" "}
        <span className="text-foreground underline decoration-current/40 underline-offset-2">
          Meditations, ch. 2
        </span>
        .
      </p>
    </div>
  );
}

// The three outputs fanned out, the book in front.
function Outputs() {
  return (
    // Wider than the sheets: the fade clips at its own edge, and the tilted
    // outer corners must stay inside it.
    <div className={cn("relative -mx-12 h-72 w-[42rem]", ANGLE)}>
      <MarkdownSheet className="left-14 w-60 -rotate-6 translate-y-10" />
      <RawSheet className="right-14 w-60 rotate-6 translate-y-10" />
      <BookSheet className={cn("left-1/2 w-64 -translate-x-1/2", FRONT)} />
    </div>
  );
}

export function ToolSketch() {
  return (
    <div aria-hidden className="mx-auto flex w-full max-w-xl flex-col items-center">
      <ul className="grid w-full grid-cols-3 gap-3">
        {SOURCES.map(({ src, media, kind, title, meta, tilt, drop }, i) => (
          <li
            key={kind}
            style={
              {
                "--tilt": `${tilt}deg`,
                "--drop": `${drop}px`,
                animationDelay: `${i * 110}ms`,
              } as React.CSSProperties
            }
            // Light: an opaque card lifted off the glow, which swallowed it.
            className="sketch-card border-border bg-card/90 shadow-sm dark:bg-background/60 dark:shadow-none text-muted-foreground flex min-w-0 items-center gap-2.5 rounded-lg border p-2 text-left"
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
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
                <span className="eyebrow text-3xs! text-inherit">{kind}</span>
                <MetaSep />
                {meta}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {/* The binding, drawn once on arrival; still under reduced motion. */}
      <svg viewBox="0 0 300 48" preserveAspectRatio="none" className="h-12 w-full overflow-visible">
        {/* Faint under the sources, firmest midway, fading again where the
            threads meet so their point doesn't stab the book. */}
        <defs>
          <linearGradient id="sketch-thread-ink" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="48">
            <stop offset="0" style={{ stopColor: "var(--primary-strong)", stopOpacity: 0.1 }} />
            <stop offset="0.55" style={{ stopColor: "var(--primary-strong)", stopOpacity: 0.35 }} />
            <stop offset="1" style={{ stopColor: "var(--primary-strong)", stopOpacity: 0.03 }} />
          </linearGradient>
        </defs>
        {STARTS.map((x, i) => (
          <path
            key={x}
            d={`M${x} ${SOURCES[i].drop} C ${x} 30, 150 22, 150 48`}
            pathLength={1}
            stroke="url(#sketch-thread-ink)"
            className="sketch-thread fill-none"
            style={{ animationDelay: `${520 + i * 110}ms` }}
          />
        ))}
      </svg>

      {/* The compilation's three outputs, running off the bottom of the
          picture: an illustration, never a document to read to the end. */}
      <div className="sketch-book">
        <Outputs />
      </div>
    </div>
  );
}
