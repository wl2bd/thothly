import * as React from "react"

import { cn } from "@/lib/utils"

// Stone tablet edge — a carved, near-static rim that turns the wrapped surface
// into a stone slab.
//
// Inspired by an "electric border" run at minimum speed in a stone tone (where
// the moving arc settles into a hand-hewn edge), but rebuilt on the brand's own
// material: instead of a per-frame canvas, an SVG displacement filter — fed by
// the same fractal noise as the grain (feTurbulence) — erodes a stone-toned,
// card-filled rounded rect into an organic silhouette. Fully static (no canvas,
// no requestAnimationFrame), so it's cheap and reduced-motion-safe by nature.
//
// The wrapped surface should be transparent (no bg, no border) so this slab IS
// its surface; content sits on top:
//   <StoneBorder>
//     <div className="bg-transparent">…</div>
//   </StoneBorder>
//
// Render <StoneFilterDefs /> ONCE near the app root so `filter: url(#…)` in the
// `.stone-frame` rules (globals.css) resolves. Knobs: the `--stone` token, and
// the filter primitives below (baseFrequency = erosion scale, scale = how much
// it's chewed away).
function StoneBorder({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("stone-frame", className)} {...props}>
      {children}
    </div>
  )
}

// The shared displacement filter, defined once. A zero-size svg keeps it out of
// layout; aria-hidden as it's purely decorative.
function StoneFilterDefs() {
  return (
    <svg aria-hidden width="0" height="0" focusable="false">
      <defs>
        <filter
          id="thothly-stone-edge"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.016 0.02"
            numOctaves="3"
            seed="11"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="10"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  )
}

export { StoneBorder, StoneFilterDefs }
