// The grain — Thothly's signature material, lifted from the wordmark's own
// fractal-noise texture (see components/brand.tsx) and promoted to a system
// material per DESIGN.md. It is what keeps a surface feeling inked rather than
// machine-printed.
//
// Strictly decorative: aria-hidden, pointer-events-none, and it sits *behind*
// content at a very low opacity, so it never lowers text contrast. `mix-blend`
// modulates luminance both ways, so the same grain reads on the white page and
// on the night ground. The motion-free SVG is safe under prefers-reduced-motion.
//
// Drop it into a `relative isolate overflow-hidden` container and let it fill:
//   <Grain className="pointer-events-none absolute inset-0 -z-10 size-full
//     opacity-[0.06] mix-blend-overlay dark:opacity-[0.12]" />

export function Grain({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <filter id="thothly-grain">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.82"
          numOctaves="3"
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#thothly-grain)" />
    </svg>
  );
}
