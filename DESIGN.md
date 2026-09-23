---
name: Thothly
description: Read anything like a book. Near-neutral grounds carrying one strong color, desert gold.
colors:
  background: "oklch(0.977 0.011 80)"
  foreground: "oklch(0.16 0.015 68)"
  card: "oklch(0.995 0.008 80)"
  secondary: "oklch(0.915 0.018 80)"
  muted: "oklch(0.955 0.014 80)"
  muted-foreground: "oklch(0.48 0.02 70)"
  surface-sunken: "oklch(0.957 0.014 80)"
  border: "oklch(0.87 0.018 78)"
  hero-ground: "oklch(0.94 0.026 78)"
  primary: "oklch(0.82 0.145 80)"
  primary-strong: "oklch(0.6 0.15 75)"
  destructive: "oklch(0.52 0.21 27)"
  success: "oklch(0.5 0.12 150)"
  warning: "oklch(0.53 0.16 45)"
  info: "oklch(0.52 0.13 255)"
  background-dark: "oklch(0.13 0 0)"
  foreground-dark: "oklch(0.97 0 0)"
  card-dark: "oklch(0.17 0 0)"
  muted-dark: "oklch(0.22 0 0)"
  muted-foreground-dark: "oklch(0.7 0 0)"
  surface-sunken-dark: "oklch(0.15 0 0)"
  primary-dark: "oklch(0.71 0.135 78)"
  primary-foreground-dark: "oklch(0.16 0 0)"
typography:
  display:
    fontFamily: "Prociono, Georgia, serif"
    fontSize: "2.75rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Prociono, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Host Grotesk, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "Host Grotesk, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Host Grotesk, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
  edition:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "0.625rem"
    fontWeight: 400
    lineHeight: 1.625
rounded:
  xs: "0.125rem"
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  4xl: "1.625rem"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.75rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "2.5rem"
    padding: "0 1rem"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "2.5rem"
    padding: "0 1rem"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "1.75rem"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
  badge-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.4xl}"
    height: "1.25rem"
    padding: "0.125rem 0.5rem"
---

# Design System: Thothly

> **Status (2026-09-23).** This file is derived from the shipped code
> (`frontend/app/globals.css` is the source of truth for every value). The
> identity itself is due for a review; until then, this records what ships, not
> an aspiration. Where the two disagree, the code wins and this file is stale.

## Overview

**Creative North Star: "Gold Leaf."**

One precious metal on a quiet ground. The grounds are near-neutral: a warm
off-white by day (a whisper of the gold's hue, chroma ≤ 0.018), a true near-black
by night (chroma 0). Against them, one strong color does the talking: **desert
gold**, the brand's action color. It is the heir of the name (Thoth, writing,
the gilt of an illuminated page), executed as a flat, bold, modern color rather
than a texture. It is at its most alive on the night ground.

Two halves, one system. The app (search, review, compile, read) is calm and
task-first; the landing (hero, "How it works", "Yours, on your machine", FAQ) is
more expressive. The expressive layer is carried by a few earned signatures: the
hieroglyph rain behind the hero, the rotating gold frame around the search field,
the carved stone tablets, and the grain on the wordmark. Everything else is plain
shadcn / base-ui primitives on the token layer.

Light and dark are both first-class. The theme is set before paint.

**Key Characteristics:**
- One brand color, desert gold, on primary actions, focus, current/active, the mark.
- Near-neutral grounds: warm off-white (light), chroma-0 near-black (dark).
- A serif display voice (Prociono) over a warm grotesk UI (Host Grotesk).
- Flat surfaces; depth from tonal steps, with one ambient lift on the flow card.
- One role-named token layer re-skins both modes.

## Colors

Near-neutral grounds and exactly one chromatic brand color. Any other hue on a
screen is either a status color or a mistake.

### Token layer

Tokens follow the shadcn convention: a surface role and its `-foreground` pair.
Components use role utilities (`bg-primary`, `text-muted-foreground`), never
raw values. Names describe a role, never a value (`--primary`, not `--gold`).

| Token | Role |
|---|---|
| `background` / `foreground` | The page and its ink. |
| `card`, `popover` | Surfaces a step above the page (popover = card). |
| `secondary` | Secondary buttons, quiet badges. |
| `muted`, `accent` | Hover fills and quiet chips (accent = muted). |
| `muted-foreground` | Secondary text, metadata, placeholders. |
| `surface-sunken` | Recessed surfaces: source chips, the hero search panel. |
| `border`, `input` | Hairlines and field strokes. |
| `primary` / `primary-foreground` | Desert gold fill and the ink on it. |
| `primary-strong` | Gold as text or icon on a neutral surface; also `ring`. |
| `destructive`, `success`, `warning`, `info` | Status, data only. |
| `hero-ground`, `hero-scrim` | The hero fold's ground and headline scrim. |
| `flow-card-lift` | The flow card's ambient shadow (`shadow-flow-card`). |
| `rule`, `rain-lead/body/tail/halo` | The inscription lines and glyph-rain tones (read by the canvas). |

Component-scoped tokens live on their component: the gold frame's
`--frame-trough` / `--frame-glint` ramp is declared on `.gold-frame`.

### Primary
- **Desert Gold** (`--primary`, `oklch(0.82 0.145 80)` light, `oklch(0.71 0.135 78)`
  dark): primary buttons, the switch track, the current/active item, the mark,
  the funnel node. Text on it is always the ink (8.9:1).
- **Deep Gold** (`--primary-strong`, `oklch(0.6 0.15 75)` light, equal to the
  primary on dark): the gold when it has to read on a neutral surface: icons,
  the paid-path badge text, the select check, link hover, and the focus ring
  (4.0:1 on the page). On the night ground the fill gold already reads.

### Neutral
- **Page** (`--background`, `oklch(0.977 0.011 80)` / `oklch(0.13 0 0)`).
- **Ink** (`--foreground`, `oklch(0.16 0.015 68)` / `oklch(0.97 0 0)`).
- **Card** (`--card`, `oklch(0.995 0.008 80)` / `oklch(0.17 0 0)`).
- **Secondary** (`oklch(0.915 0.018 80)` / `oklch(0.22 0 0)`).
- **Muted** (`oklch(0.955 0.014 80)` / `oklch(0.22 0 0)`) with **Muted Ink**
  (`oklch(0.48 0.02 70)` / `oklch(0.7 0 0)`).
- **Sunken** (`oklch(0.957 0.014 80)` / `oklch(0.15 0 0)`).
- **Hairline** (`--border`, `oklch(0.87 0.018 78)` / white at 12%; inputs 16%).
- **Hero Ground** (`oklch(0.94 0.026 78)` light, transparent on dark): the warm
  taupe the light glyph rain sits on. Hero only; fades into the page.

### Status
- **Success** `oklch(0.5 0.12 150)`, **Warning** `oklch(0.53 0.16 45)`, **Info**
  `oklch(0.52 0.13 255)`, **Destructive** `oklch(0.52 0.21 27)` (light values;
  dark lifts them to L 0.68 to 0.78). Warning is pushed to orange (hue 45) so it
  never reads as the gold (hue 78). Used as 10%-alpha chips with the full color
  as text.

### Named Rules
**The One Color Rule.** Desert gold is the only brand hue. The four status
colors are data, not decoration. No second accent.

**The Quiet Ground Rule.** Grounds stay near-neutral. On light they carry a faint
pull toward the gold's hue (chroma ≤ 0.018), never cream, sand or parchment; on
dark they are chroma 0. The one visible tint is the light hero ground. Open
question for the identity review: whether the dark neutrals should warm to match.

**The Gold-Holds-Ink Rule.** Text on a gold fill is always the ink, never white.
Gold as text on a neutral uses `primary-strong`, never the fill gold.

## Typography

**Display Font:** Prociono (with Georgia, serif). A roman serif, Regular only,
self-hosted.
**Body / UI Font:** Host Grotesk (with system-ui, sans-serif). Variable, runs the
whole tool.
**Mono Font:** Geist Mono (with ui-monospace). Durations, counts, the Markdown twin.
**Edition Font:** Literata (with Georgia, serif). Only where Thothly shows a book.
**Rain fonts:** Noto Sans Egyptian Hieroglyphs and Noto Serif Display Thin (100),
only inside the hero glyph rain.

**Character:** A literary serif voice for the big moments over a warm, readable
grotesk for the work. The display face gives the product its "edition" feel; the
grotesk keeps the tool from reading as either corporate or costume.

### Hierarchy
- **Display** (Prociono 400, `text-display` 2.75rem rising to 3.75rem at `sm`,
  `leading-display` 1.1, `tracking-tight`): the hero line.
- **Headline** (Prociono 400, `text-2xl` to `text-3xl`, `tracking-tight`): landing
  section headings, app page titles (Settings, the finished compilation), the
  reader's chapter title (`text-xl`).
- **Title** (Host Grotesk 500, 1rem): item titles, card and dialog headers.
- **Body** (Host Grotesk 400, `text-sm` 0.875rem; landing prose adds
  `leading-relaxed`; the hero subtitle is `text-lg`/`text-xl`, `leading-snug`).
- **Label** (Host Grotesk 500, `text-xs` 0.75rem): badges, metadata, buttons `sm`.
- **Mono** (Geist Mono, `text-xs`): durations, counts, technical detail.
- **Miniature** (`text-2xs` 0.625rem, `text-3xs` 0.55rem): only inside the drawn
  tablets and the funnel figure, a book page at thumbnail scale; `text-2xs`
  also sets keyboard-key hints (mono, tracked capitals). Never other UI text.

### Named Rules
**The Display Restraint Rule.** Prociono sets titles only: the hero, section
headings, page titles, a chapter title. Never body, buttons, labels, form
controls or data, and never a bolder weight (it ships Regular; the browser would
fake-bold it).

**The Edition Serif Rule.** Literata appears only where Thothly is showing a book:
the output tablets. It is the edition's voice, not the tool's.

**The Quiet Caps Rule.** Uppercase tracked labels are a named device (source group
headers, the tablet's "CHAPTER 2"), never a reflex eyebrow above every section.

## Layout

Content sits in a centered `max-w-5xl` column with `px-6` gutters; the landing's
two-column sections switch on at `lg` (`grid-cols-2`, `gap-10`). Prose and the
hero subtitle cap at `max-w-xl`. The flow card (search, review, done) is the one
surface that carries the whole journey and morphs between phases through a shared
view transition (`flow-card`). Spacing follows Tailwind's 0.25rem scale; the
common rhythm is `gap-1` to `gap-4` inside components and `--spacing(7)` (1.75rem)
card padding. Breakpoints are Tailwind's defaults (`sm` 640, `md` 768, `lg` 1024).

## Elevation & Depth

Flat by default. Depth comes from tonal steps: the card is a step lighter than
the page in light, a step lighter than the near-black in dark, plus a 1px
hairline.

### Shadow Vocabulary
- **Flow card lift** (`--flow-card-lift`: `0 0 32px rgb(0 0 0 / 0.07)` light,
  `0 0 40px rgb(0 0 0 / 0.3)` dark): the flow card only. An ambient glow with no
  offset: the card sits on the ground, it does not hover.
- **Overlay** (Tailwind `shadow-md` to `shadow-xl`): tooltips, select popups,
  dialogs. Standard shadcn values.
- **Stone cast shadow**: the tablets' carved edge (see Components).

### Named Rules
**The Flat-By-Default Rule.** A shadow at rest is allowed only on the flow card
and the stone tablets. Everything else is flat until it floats (popups, dialogs).

## Shapes

One radius base, `--radius: 0.625rem`, with the shadcn scale derived from it
(`sm` 0.375, `md` 0.5, `lg` 0.625, `xl` 0.875 … `4xl` 1.625rem). Buttons, inputs
and cards use `rounded-lg`; badges are pills (`rounded-4xl`); tiny marks (the
search highlight, favicons, the duration chip) use `rounded-xs`. The stone tablets
break the geometry on purpose: an SVG displacement filter erodes their edge into
a hand-hewn silhouette.

## Components

shadcn / base-ui primitives (`components/ui/`) re-skinned by the token layer.
Leave their internals conventional; brand lives in the tokens and the signatures.

### Buttons
- **Primary:** gold fill, ink text, `h-10`, `rounded-lg`, `text-sm` medium.
  The committing action on each screen (Search, Compile, Download EPUB).
- **Secondary:** secondary fill, ink text. **Ghost / Outline / Link:** shadcn.
- **Focus:** `ring-3` in `ring/50` (deep gold on light, gold on dark).

### Badges
- **Content tag** (review rows): `secondary` pill naming what was retrieved
  (Transcript, Raw captions, Web text, From audio).
- **Paid path:** `bg-primary/10` with `text-primary-strong` and a coin icon: the
  one cue that a step costs money.
- **Status:** success / warning / info / destructive at 10% alpha.

### Cards, inputs, controls
- **Card:** `bg-card`, 1px hairline, `rounded-lg`, 1.75rem padding. Never nested.
- **Input:** card ground, hairline stroke, placeholder in muted ink (≥ 4.5:1).
- **Switch:** gold track when on; used only for the "AI polish" master toggle.
  Checkboxes everywhere else.

### Signatures
- **Gold frame** (`.gold-frame`, `components/ui/animated-gold-border.tsx`): a 2px
  conic gold ring (trough, gold, glint) that spins slowly and blooms a soft gold
  glow on focus. Around the search field only. Static under reduced motion.
- **Hieroglyph rain** (`components/hieroglyph-rain.tsx`): a canvas of falling gold
  glyph columns between eroded inscription rules, behind the hero. Tones come from
  `--rain-*` and `--rule`, inverted per theme. One still frame under reduced motion.
- **Stone tablet** (`.stone-frame`, `components/ui/stone-border.tsx`): the output
  illustrations (EPUB, Markdown) as carved slabs with a `--rule` rim.
- **Grain** (`components/grain.tsx`): fractal noise on the wordmark and, faintly,
  the page and hero. Decorative, `aria-hidden`, never lowers text contrast.
- **Completion seal:** the mark lands on the finished compilation with a single
  gold bloom (`ease-out-expo`), then rests.

### Motion
One house curve, `ease-out-quint` (`cubic-bezier(0.22, 1, 0.36, 1)`), for every
transition and the flow-card morph (300ms group, 220ms cross-fade; slower when
returning home). `ease-out-expo` is reserved for the one-shot completion reveal.
Every animation has a `prefers-reduced-motion` alternative.

## Do's and Don'ts

### Do:
- **Do** use role tokens through their utilities; add a token (by role) before
  hard-coding a value, and extend a scale rather than making an exception.
- **Do** make desert gold the one brand color: primary CTAs, focus, active, the mark.
- **Do** use `primary-strong` for gold text or icons on a neutral surface.
- **Do** keep the ink on every gold fill, and body and placeholder text ≥ 4.5:1.
- **Do** keep Prociono to titles and Literata to the drawn book surfaces.
- **Do** ship a reduced-motion alternative for every animation.

### Don't:
- **Don't** build a cold enterprise dashboard or a generic AI SaaS page: no
  gradient hero, glassy cards, hero-metric grid, fluorescent accents, gradient text.
- **Don't** wear the costume: no papyrus, sepia or parchment. The hieroglyphs are
  one earned motif (the rain), flat and token-driven, not a theme.
- **Don't** introduce a second brand color, or use gold where a status belongs.
- **Don't** put white text on gold, or the fill gold as text on the light page.
- **Don't** fork the shadcn primitives' internals to restyle them; change tokens.
- **Don't** add resting shadows, side-stripe borders, or a tracked eyebrow above
  every section.
