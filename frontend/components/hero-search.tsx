"use client";

import { useState, ViewTransition } from "react";
import { useRouter } from "next/navigation";

import { ChevronDownIcon, ConstructionIcon, SearchIcon } from "lucide-react";

import { AnimatedGoldBorder } from "@/components/ui/animated-gold-border";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Grain } from "@/components/grain";
import { HieroglyphRain } from "@/components/hieroglyph-rain";
import { cn } from "@/lib/utils";

// The landing's one interactive island: the hero fold and a field that hands
// its query over to the tool. The staging machine it used to hold now lives on
// /app (see components/compose.tsx) — this surface persuades, that one works.
// Everything around it — header, How it works, FAQ, footer — stays
// server-rendered.
export function HeroSearch() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  // Whether the bar is engaged. The leading magnifier is treated as resting-
  // state chrome (like the placeholder): it shows only on an empty, unfocused
  // bar and clears the moment the field is focused, leaving the full width to
  // type into.
  const [focused, setFocused] = useState(false);

  const trimmed = query.trim();
  const showSearchIcon = query === "" && !focused;

  // The landing hands the query over rather than answering it. This is what
  // keeps the split from costing a click: you type here, you land in the tool
  // with the search already running. An empty field still goes across, so the
  // button is never a dead end.
  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    router.push(trimmed ? `/app?q=${encodeURIComponent(trimmed)}` : "/app");
  }

  return (
    <section
      id="top"
      className="relative isolate flex min-h-[66svh] scroll-mt-14 flex-col items-center justify-center overflow-hidden px-6 py-16 sm:py-20"
      style={{
        background:
          "linear-gradient(to bottom, var(--hero-ground) 0%, var(--hero-ground) 35%, transparent 100%)",
      }}
    >
      {/* Hero backdrop. A desert-gold glyph rain (Thoth's hieroglyphs +
          falling letters) runs behind the content in BOTH modes: warm
          white-hot on the night ground, deep gold on the light page. The
          fold's own ground (the section's --hero-ground gradient, warm taupe
          on light / the near-black page on dark) carries the warmth and lets
          the deep glyphs read; above it a scrim pools that ground behind the
          headline so the text always clears the rain (warm taupe on light,
          black on dark). Grain over all. Decorative, behind content,
          reduced-motion-safe. */}
      <HieroglyphRain className="pointer-events-none absolute inset-0 -z-30 size-full opacity-90 [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_84%,transparent)]" />
      {/* Grain stays a whisper on the night ground: mix-blend-overlay lifts
          the near-black toward grey fast, so dark opacity is kept low (~0.08)
          to keep the ground a rich black under the gold rain. */}
      <Grain className="pointer-events-none absolute inset-0 -z-10 size-full opacity-[0.12] mix-blend-overlay dark:opacity-[0.08]" />
      {/* Legibility scrim, painted over the grain. Its tone is the single
          theme-flipped --hero-scrim token (warm taupe on light, near-black on
          dark) so it can never bleed across modes. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "var(--hero-scrim)" }}
      />
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <div className="flex flex-col items-center gap-5 text-center">
          <span className="border-gold/30 bg-gold/10 text-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
            <ConstructionIcon className="text-gold size-3.5" aria-hidden="true" />
            Work in progress
          </span>
          <h1 className="font-display text-[2.75rem] leading-[1.05] tracking-tight text-balance sm:text-6xl">
            Make anything readable
          </h1>
          <p className="text-muted-foreground max-w-xl text-balance text-lg leading-[1.4] sm:text-xl">
            Turn videos, podcasts, articles, even whole playlists into one
            clean read for your e-reader or your AI.
          </p>
        </div>

        {/* Shared identity with the tool's card and the job page's: all three
            carry the same flow-card name, so this field morphs into the one on
            /app instead of the page hard-cutting, and the flow reads as one
            continuous surface from the landing to the finished compilation. */}
        <ViewTransition name="flow-card">
        <Card className="bg-surface-sunken shadow-flow-card">
          <CardContent>
            {/* The button sits inside the field from sm up, and stacks under it
                below that. On a phone there is not enough room for both: an
                in-field pill leaves about 145px to type in, which clips the
                placeholder mid-word. The form is the positioning context, so
                this is one button moving, not two buttons taking turns. */}
            <form
              onSubmit={onSubmit}
              className="relative flex flex-col gap-2 sm:block"
            >
              <AnimatedGoldBorder>
                {/* The magnifier is resting-state chrome, like the placeholder:
                    this bar both searches and takes a pasted link, so a "search"
                    glyph isn't always accurate. It clears the instant the field
                    is focused (or holds content), handing the full width over to
                    type into. Kept in the DOM (absolute, so no layout cost) and
                    cross-faded with a slight slide so the placeholder glides in
                    to replace it instead of the text snapping sideways. */}
                <SearchIcon
                  aria-hidden="true"
                  className={cn(
                    "text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                    showSearchIcon ? "opacity-100" : "-translate-x-1 opacity-0",
                  )}
                />
                <Input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder="Search or paste a link…"
                  className={cn(
                    // The hero's primary action: a tall, confident bar with type
                    // a clear step up from the app's default fields (18px) so it
                    // reads as the unmistakable main entry point of the page. The
                    // padding is transitioned so the text/placeholder glides when
                    // the magnifier comes and goes rather than snapping.
                    "h-14 border-transparent bg-background text-lg md:text-lg transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-0 motion-reduce:transition-none dark:bg-background",
                    // Left: room for the magnifier only while it shows (empty &
                    // unfocused); otherwise the text runs full width. Right:
                    // room for Start only where Start is in the field.
                    showSearchIcon ? "pl-11" : "pl-4",
                    "pr-4 sm:pr-24",
                  )}
                  autoComplete="off"
                />
              </AnimatedGoldBorder>
              {/* The field alone gives a pointer user nothing to press, and this
                  one submits on any state (empty included), so the affordance is
                  permanent rather than appearing with content. Full width and a
                  taller tap target on a phone; from sm up it tucks into the
                  field on an equal 8px inset top/bottom/right, a h-10 pill
                  centered in the h-14 bar. */}
              <Button
                type="submit"
                className="h-12 w-full sm:absolute sm:top-1/2 sm:right-2 sm:h-10 sm:w-auto sm:-translate-y-1/2"
              >
                Start
              </Button>
            </form>
          </CardContent>
        </Card>
        </ViewTransition>

        {/* Practical heads-up about what currently works best, kept with the
            field it qualifies. */}
        <p className="text-muted-foreground/80 mx-auto max-w-md text-center text-xs leading-relaxed text-balance">
          Some features are limited or still in progress. YouTube gets
          rate-limited from the cloud, so pasting an article or blog link works
          best for now.
        </p>
      </div>

      {/* A quiet nudge past the now-taller fold to "how it works". Soft drift,
          not a hard bounce; dropped under reduced motion. */}
      <a
        href="#how-it-works"
        aria-label="See how it works"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute bottom-6 left-1/2 hidden -translate-x-1/2 rounded-full p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:block"
      >
        <ChevronDownIcon className="hero-scroll-cue size-5" />
      </a>
    </section>
  );
}
