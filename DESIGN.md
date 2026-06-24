---
name: Thothly
description: Read anything like a book — a stark canvas carrying one strong color, desert gold.
colors:
  page: "oklch(0.98 0 0)"
  white: "oklch(1 0 0)"
  surface: "oklch(0.96 0 0)"
  hero-ground: "oklch(0.945 0.011 80)"
  ink: "oklch(0.16 0 0)"
  muted-ink: "oklch(0.47 0 0)"
  hairline: "oklch(0.9 0 0)"
  gold: "oklch(0.76 0.15 78)"
  gold-bright: "oklch(0.8 0.145 80)"
  gold-deep: "oklch(0.6 0.15 75)"
  gold-foreground: "oklch(0.16 0 0)"
  night: "oklch(0.13 0 0)"
  night-raised: "oklch(0.17 0 0)"
  paper: "oklch(0.97 0 0)"
  alarm: "oklch(0.52 0.21 27)"
  seal-green: "oklch(0.5 0.12 150)"
  amber-caution: "oklch(0.53 0.16 45)"
  lapis-info: "oklch(0.52 0.13 255)"
typography:
  display:
    fontFamily: "Prociono, Georgia, serif"
    fontSize: "clamp(2.75rem, 5vw, 3.75rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Host Grotesk, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Host Grotesk, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "Host Grotesk, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Host Grotesk, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.02em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.gold-foreground}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
  card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
  badge-gold:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.gold-foreground}"
    rounded: "{rounded.sm}"
    padding: "0.0625rem 0.5rem"
  badge-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.sm}"
    padding: "0.0625rem 0.5rem"
---

# Design System: Thothly

## 1. Overview

**Creative North Star: "Gold Leaf."**

Thothly is a stark canvas carrying a single precious metal. The page is neutral
to the bone — a soft off-white by day, a near-black by night, every grey at
chroma zero — so that one warm color, **desert gold**, does all the talking. The
gold is the heir of the name (Thoth, writing, the gilt of an illuminated page),
but it is executed bold and modern, not as a costume: a confident metal on an
austere ground, paired with a geometric display and a clean grotesk. It carries
real weight here — it is the brand's action color, not a rare flourish — and it
is at its most alive on the black ground, where it glows like leaf on vellum.

The two modes are equally first-class and both stark. **Light** is a soft
off-white page with pure-white cards lifting just above it, near-black text, and
desert-gold actions. **Dark** is a deep near-black with near-white text, where
the gold steps forward and burns brightest — the showcase. The neutrals never
shift hue between modes; only their lightness flips. The gold is the constant.

This system explicitly rejects three things, carried from the product's
anti-references. It is **not a cold enterprise dashboard** (the bold gold and the
black give it heat and confidence). It is **not a generic AI SaaS** (no gradient
hero, no glassy cards, no hero-metric grid, no fluorescent accents, no gradient
text). And it is **not a costume** (no papyrus, no hieroglyphs, no sepia, no
skeuomorphic parchment — the gold is a flat, bold, contemporary color, never a
texture or a relic).

**Key Characteristics:**
- One color only: desert gold. Every other surface is a pure neutral (chroma 0).
- Stark, high-contrast neutrals: soft off-white / near-black, pure-white cards.
- The gold is bold and present — primary actions, focus, active, the mark.
- Modern and a little *tech*: geometric display + grotesk, never editorial.
- A single re-skinnable OKLCH token layer drives both modes and the EPUB chrome.

## 2. Colors

A stark monochrome canvas lit by exactly one chromatic color. If a screen shows
any hue other than the gold (or a status color), something is wrong.

### Primary
- **Desert Gold** (`oklch(0.76 0.15 78)` light, `oklch(0.8 0.145 80)` dark): the
  one brand color and the action color — primary buttons, the current/active
  item, the focus ring, the mark. Warm and saturated enough to read clearly on
  the off-white page, and luminous on the night ground. Text on a gold fill is
  always near-black (gold is a light, warm metal): 8.9:1.
- **Gold Deep** (`oklch(0.6 0.15 75)`): a deeper gold used only for the
  **light-mode focus ring**, so the indicator clears WCAG 3:1 on the page (4.0:1).

### Neutral
- **Page** (`oklch(0.98 0 0)`): the light-mode ground — a soft off-white, never
  harsh pure `#fff`, at chroma 0 (no cream, no warmth — the gold is the warmth).
- **White** (`oklch(1 0 0)`): pure-white cards and inputs, which lift a step
  above the off-white page.
- **Surface** (`oklch(0.96 0 0)`): secondary buttons, hover fills, quiet chips.
- **Ink** (`oklch(0.16 0 0)`): near-black body text on light (≈18:1). Chroma 0.
- **Muted Ink** (`oklch(0.47 0 0)`): secondary text and metadata on light (≈7:1).
- **Hairline** (`oklch(0.9 0 0)`): borders, dividers, input strokes.
- **Night** (`oklch(0.13 0 0)`): the dark-mode ground — a true near-black, chroma 0.
- **Night Raised** (`oklch(0.17 0 0)`): cards and popovers on dark.
- **Paper** (`oklch(0.97 0 0)`): near-white text on the night ground.

### Status (informational only — kept distinct from the brand gold)
- **Seal Green** (`oklch(0.5 0.12 150)`) success · **Amber Caution**
  (`oklch(0.53 0.16 45)`) warning · **Lapis Info** (`oklch(0.52 0.13 255)`) info ·
  **Alarm** (`oklch(0.52 0.21 27)`) destructive. Warning is pushed to orange
  (hue 45) so it never reads as the brand gold (hue 78). These are light-mode
  values, darkened so each status' text clears 4.5:1 on its 10%-alpha chip; dark
  mode lightens them (L 0.68-0.78) for AA on the night.

### Named Rules
**The One Color Rule.** The desert gold is the only chromatic color on the page;
every neutral is pure (chroma 0). The gold does all the talking. If a surface
needs a second brand color, the answer is no — the only other hues allowed are
the four status colors, and those are data, not decoration.

**The Stark Surface Rule.** Neutrals carry zero hue. No cream, no sand, no
parchment, no blue-grey — and never harsh pure `#fff` for the page (a soft
off-white `oklch(0.98 0 0)`, with pure-white cards lifting above it). Warmth is
the gold's job, never the surface's. ONE scoped exception (2026-06-24): the
**light-mode hero ground** (`--hero-ground`, a warm taupe `oklch(0.945 0.011 80)`,
low chroma toward the gold hue) — the fold needs its own ground for the deep-gold
glyph rain to read, the way the near-black carries the dark hero. It is hero-only
(the rest of the page stays chroma 0) and fades to the page at the fold's bottom
so there's no seam; dark keeps the near-black page (`--hero-ground: transparent`).
Outside this single fold, the rule holds: no tinted surfaces anywhere else.

**The Gold-Holds-Ink Rule.** Gold is a light metal: text on a gold fill is always
near-black Ink, never white. The same gold is the primary action in both modes —
just brighter on the night ground (no per-mode color inversion).

## 3. Typography

> **TYPE SHIFT — 2026-06-24 (factual note; fuller reconciliation pending).** The
> display face changed from the geometric **CMGeom** to **Prociono** (a roman/
> serif, OFL, self-hosted) — Wael's call — and the hero glyph-rain Latin letters
> changed from Literata to **Noto Serif Display Thin (100)**, a hairline. So the
> type voice now leans **editorial/literary**, not the "geometric, deliberately
> not editorial" stance described below. The body text and the Display/Edition
> Serif rules below still describe the retired geometric framing and will be
> rewritten once the type identity settles (it is mid-chantier). Treat the
> font *names* in this section as: Display = Prociono, Edition (EPUB tablet) =
> Literata, hero-rain letters = Noto Serif Display Thin.

**Display Font:** CMGeom (with system-ui, sans-serif) — a geometric display face,
reserved for the two largest title levels: the hero line and the landing section
headings.
**Body / UI Font:** Host Grotesk (with system-ui, sans-serif) — a warm, highly
readable grotesk (variable, 300–800) that runs the whole tool.
**Label / Mono Font:** Geist Mono (with ui-monospace) — for metadata, numbers,
and the Markdown twin.
**Edition Font:** Literata (with Georgia, serif) — the serif Google designed for
e-reader reading. The deliverable's literary voice, reserved for the "book"
surfaces only (see The Edition Serif Rule); never the UI.

**Character:** Geometric display + readable grotesk — modern and a little *tech*,
deliberately **not editorial**. CMGeom's geometry gives the hero a confident,
built voice; Host Grotesk does all the actual reading with warmth (warmer than a
neutral like Inter, which keeps the tool from feeling corporate). The pairing
holds because the axis is real (geometric display vs. humanist grotesk), not two
near-identical sans. Serif is kept off the tool entirely — it read too editorial
for the UI — with ONE deliberate, scoped exception: the edition serif (Literata)
on the "book" surfaces only (see The Edition Serif Rule).

### Hierarchy
- **Display** (CMGeom, 400): the two largest title levels — the hero line
  (`clamp(2.75rem, 5vw, 3.75rem)`, lh 1.05, `-0.02em`; ceiling ≤ 3.75rem, composed
  not shouting) and the landing section headings ("How it works", "Yours, on your
  machine", "Questions") at 1.5rem with `tracking-tight`. The brand's geometric
  voice. Regular weight only — never `font-semibold` (the browser would fake-bold
  it).
- **Headline** (Host Grotesk, 600, 1.5rem, lh 1.2): headings in the working UI
  (job page, dialogs, in-app sections) — everything that isn't the hero or a
  landing section heading.
- **Title** (Host Grotesk, 500, 1rem): item titles, card headers, dialog titles.
- **Body** (Host Grotesk, 400, 0.95rem, lh 1.6): UI copy. Prose capped at 65–75ch.
- **Label** (Host Grotesk, 500, 0.75rem, `0.02em`): metadata rows, badges, small UI.
- **Mono** (Geist Mono, 0.8125rem): the Markdown twin, token counts, durations,
  technical detail — the scribe's measuring marks.
- **Edition** (Literata, 400 / 600): the "book" surfaces only — the EPUB tablet in
  the landing illustration (chapter title + body) and the Latin letters of the
  hero glyph rain. The literary voice of the deliverable, never the UI.

### Named Rules
**The Display Restraint Rule.** CMGeom is a display face: it carries exactly the
two largest title levels — the hero line and the landing section headings — and
nothing else. Not the working UI, not illustration flourishes (the faux book
title is Host Grotesk), not item or card titles. Every other heading is Host
Grotesk in a heavier weight. Never set CMGeom on body, buttons, labels, form
controls or data — and never request a bolder CMGeom weight; it ships Regular
only, so the browser would fake-bold it.

**The Edition Serif Rule.** Literata appears ONLY where Thothly is *showing a
book*: the EPUB representation (the output tablet in the landing illustration) and
the Latin letters in the hero glyph rain. It is the voice of the edition, not the
tool — never on UI, body, buttons, labels or data, where grotesk rules. (Decided
2026-06-24: a deliberate, scoped lift of the former "no serif anywhere" rule, the
counterpart to the hieroglyph exception in PRODUCT.md.)

**The Quiet Caps Rule.** Uppercase tracked labels are allowed as a UI device
(source group headers, "Sources · 3"), but never as a decorative eyebrow above
every section. One named device, not a reflex.

## 4. Elevation

Flat by default, with depth from tonal layering, not drop shadows. In light mode,
**pure-white cards lift above the off-white page** (a step of lightness + a 1px
hairline) — that is the elevation, no shadow needed. In dark mode, Night Raised
cards sit above the near-black ground the same way. Shadows are a response to
state, never a resting decoration.

### Shadow Vocabulary
- **Resting** (`box-shadow: none`): cards, panels and inputs sit flat, lifted only
  by their surface step and a 1px Hairline border.
- **Lift** (`box-shadow: 0 1px 2px oklch(0 0 0 / 0.06), 0 4px 16px oklch(0 0 0 / 0.06)`):
  popovers, dropdowns and the result list on hover.
- **Goldlight** (dark mode only, `box-shadow: 0 0 0 1px oklch(0.8 0.145 80 / 0.25), 0 6px 24px oklch(0.8 0.145 80 / 0.14)`):
  a faint gold glow under the primary action on the night ground. The one moment
  the metal is allowed to radiate.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow is a verb —
hover, open, focus — never a noun. Depth at rest comes from the surface step
(card vs page), not a drop shadow. One scoped exception: the **stone tablet** (a
decorative signature standing in for a physical carved slab, not a UI surface)
carries a soft carved cast-shadow that follows its eroded silhouette — on the
light page only, where a white slab on the near-white ground would otherwise read
flat. On the night ground the contrast against the near-black carries the lift,
so it reverts to a faint stone halo. This is a property of the signature, not a
licence for resting shadows on real surfaces.

## 5. Components

The vocabulary is shadcn/base-ui primitives, re-skinned onto the stark + gold
tokens. Same shape, same states, every screen.

### Buttons
- **Shape:** composed corners (`{rounded.md}` = 0.5rem), set like type.
- **Primary:** Desert Gold fill, near-black Ink text, padding `0.5rem 1rem`. The
  "Continue", "Generate" and "Download" actions — gold in both modes (brighter on
  dark).
- **Hover / Focus:** gold deepens slightly on hover; a **gold focus ring** (2px,
  `--ring`) on every focusable control — Gold Deep in light, Bright Gold in dark.
- **Secondary:** Surface fill, Ink text. **Ghost:** transparent, Surface on hover.

### Chips / Badges
- **Source / type badges:** Secondary badge — Surface background, Muted Ink text,
  no border, `{rounded.sm}`. Quiet by default.
- **Gold badge:** the one accent badge — Desert Gold background, Ink text — for a
  "current"/"selected" or hero status.
- **Status badges:** keep the semantic colors (Seal Green ✅, Amber Caution ⚠️,
  Alarm ⛔). These are data, not brand.

### Cards / Containers
- **Corner Style:** `{rounded.lg}` (0.625rem). **Background:** White (lifts above
  the off-white Page) in light / Night Raised in dark. **Shadow:** none at rest
  (Flat-By-Default). **Border:** 1px Hairline. **Padding:** `{spacing.lg}`. Never
  nest a card in a card.

### Inputs / Fields
- **Style:** White ground, 1px Hairline stroke, `{rounded.md}`. Placeholder uses
  Muted Ink (≥4.5:1), never a pale grey. **Focus:** Hairline → gold, plus the 2px
  gold ring. **Error:** Alarm stroke + ring.

### Navigation
- **Header:** sticky, translucent backdrop blur over the page, 1px Hairline base,
  the **Logotype** at left (Ink in light / Paper in dark, via `currentColor`), the
  theme toggle at right. **Footer:** Logotype + one quiet line of Muted Ink.

### Signature: The Grain
The wordmark carries a fractal-noise grain (`feTurbulence` + `feDisplacementMap`),
echoed as a barely-there grain on the hero (`components/grain.tsx`). It must stay
decorative — `aria-hidden`, never under body text, never lowering contrast — a
quiet tactile note on the stark canvas. Optional; remove it for a cleaner stark
read if desired.

## 6. Do's and Don'ts

### Do:
- **Do** keep every neutral at chroma 0 — soft off-white Page `oklch(0.98 0 0)` in
  light, near-black Night `oklch(0.13 0 0)` in dark — and let pure-white cards lift
  above the page.
- **Do** make desert gold the one color: primary CTAs, focus, current/active, the
  mark. It is bold and present here, not rare.
- **Do** use near-black Ink text on every gold fill (gold is a light metal), and
  the deeper gold for the light-mode focus ring so it clears 3:1.
- **Do** reserve CMGeom (display) for the two largest title levels — the hero and
  the landing section headings — and nothing else; Host Grotesk runs the rest, in
  the weight the hierarchy needs.
- **Do** keep body and placeholder text at Ink / Muted Ink for ≥4.5:1.
- **Do** ship a `prefers-reduced-motion` crossfade for every transition, and keep
  the grain `aria-hidden`.

### Don't:
- **Don't** build a **cold enterprise dashboard**: no soulless corporate gray with
  no warmth. The gold and the black give it heat — if a screen reads as an admin
  panel, it is wrong.
- **Don't** slip into **generic AI SaaS**: no gradient hero, no glassy/glassmorphic
  cards, no hero-metric grid, no fluorescent accents, no gradient text.
- **Don't** wear the **costume**: no papyrus, no hieroglyphs, no sepia, no
  skeuomorphic parchment. The gold is a flat, bold, modern color, never a texture.
- **Don't** tint a neutral (no cream, sand, beige, blue-grey) and never use harsh
  pure `#fff` for the page — the gold carries all the color, the page stays a soft
  neutral off-white.
- **Don't** introduce a second brand color next to the gold; the only other hues
  are the four status colors, and those are data, not brand.
- **Don't** use white text on a gold fill (it's always Ink), and don't use the
  brand gold where a status color belongs.
- **Don't** set CMGeom (the display face) on body, buttons, labels, form controls
  or data — and don't request a bolder CMGeom weight; it ships Regular only.
- **Don't** add side-stripe borders, decorative shadows at rest, or an uppercase
  tracked eyebrow above every section.
