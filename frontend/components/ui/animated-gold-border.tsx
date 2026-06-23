import * as React from "react"

import { cn } from "@/lib/utils"

// Gold Leaf frame — Thothly's adaptation of a rotating gradient border.
//
// A refined desert-gold edge that stays calm at rest and comes alive when the
// surface it wraps is engaged (focus-within / hover): the edge reaches full
// strength, a gold glint sweeps around it, and a soft glow blooms — strongest
// on the night ground, the brand's showcase. One color only (the brand gold),
// every value token-driven, and motion that conveys state (so it honours
// `prefers-reduced-motion`).
//
// All visuals live in the `.gold-frame` rules in globals.css, so nothing is
// hard-coded and the whole effect re-skins from the OKLCH token layer. Wrap a
// surface with an opaque background (e.g. a Card) and drop its own border:
//   <AnimatedGoldBorder>
//     <Card className="relative border-transparent">…</Card>
//   </AnimatedGoldBorder>
function AnimatedGoldBorder({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("gold-frame", className)} {...props}>
      {children}
    </div>
  )
}

export { AnimatedGoldBorder }
