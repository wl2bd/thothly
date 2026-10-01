---
name: Thothly
description: Make anything readable. Warm near-neutral grounds carrying one strong color, desert gold.
colors:
  background: "oklch(0.993 0.004 80)"
  foreground: "oklch(0.16 0.015 68)"
  card: "oklch(1 0 0)"
  secondary: "oklch(0.955 0.004 80)"
  muted: "oklch(0.965 0.004 80)"
  muted-foreground: "oklch(0.5 0.004 80)"
  border: "oklch(0.16 0.015 68 / 7%)"
  input: "oklch(0.16 0.015 68 / 12%)"
  field: "oklch(0.967 0.004 80)"
  field-hover: "oklch(0.945 0.004 80)"
  primary: "oklch(0.82 0.145 80)"
  primary-strong: "oklch(0.6 0.15 75)"
  destructive: "oklch(0.52 0.21 27)"
  success: "oklch(0.5 0.12 150)"
  warning: "oklch(0.53 0.16 45)"
  info: "oklch(0.52 0.13 255)"
  background-dark: "oklch(0.13 0.004 80)"
  foreground-dark: "oklch(0.97 0.004 80)"
  card-dark: "oklch(0.17 0.004 80)"
  muted-dark: "oklch(0.22 0.004 80)"
  muted-foreground-dark: "oklch(0.7 0.004 80)"
  border-dark: "oklch(1 0 0 / 6%)"
  input-dark: "oklch(1 0 0 / 8%)"
  field-dark: "oklch(0.2 0.004 80)"
  primary-dark: "oklch(0.71 0.135 78)"
  primary-foreground-dark: "oklch(0.16 0.004 80)"
typography:
  display:
    fontFamily: "Prociono, Georgia, serif"
    fontSize: "clamp(2.25rem, 5vw, 3.75rem)"
    fontWeight: 400
    lineHeight: 1.1
  headline:
    fontFamily: "Prociono, Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 400
    lineHeight: 1.2
  title:
    fontFamily: "Host Grotesk, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "Host Grotesk, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 350
    lineHeight: 1.43
  reading:
    fontFamily: "Host Grotesk, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 350
    lineHeight: 1.625
  label:
    fontFamily: "Host Grotesk, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.05em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  4xl: "1.625rem"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "6": "1.5rem"
  "8": "2rem"
  header: "3.5rem"
  pane: "400px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "2.5rem"
    padding: "0 1rem"
  button-outline:
    backgroundColor: "{colors.field}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "2.5rem"
    padding: "0 1rem"
  button-outline-hover:
    backgroundColor: "{colors.field-hover}"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "2.5rem"
    padding: "0 0.875rem"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
  badge-outline:
    textColor: "{colors.foreground}"
    rounded: "{rounded.4xl}"
    height: "1.25rem"
    padding: "0.125rem 0.5rem"
---

# Design System: Thothly

The code is the source of truth: tokens live in `frontend/app/globals.css`, the
primitives in `frontend/components/ui/`, and the whole system is packaged as a
shadcn registry (`frontend/registry.json`, built to `/r` by `pnpm registry:build`).
When this file and the code disagree, the code wins.

## Overview

**Creative North Star: "Gold Leaf."**

One precious metal on a quiet ground. By day a warm near-white page with white
surfaces on it; by night a near-black with surfaces a step lighter. The greys
carry a barely perceptible warmth (chroma 0.004 at the gold's hue) so they sit
with the ink and the gold instead of reading cold. Against them, one strong
color does the talking: desert gold, the heir of the name (Thoth, writing, the
gilt of an illuminated page), executed as a flat modern color, never a texture.

The system is conventional shadcn on purpose. Every value is a role-named token,
every scale is Tailwind's standard scale, and the primitives are shadcn / Base UI
components re-skinned by tokens. The few additions (status colors, field fill,
pane width, header height, two small type steps, two easing curves) are declared
once in the theme and shipped in the registry. Brand lives in the token values
and in three signatures: the page glow, the grain, and the serif on titles.

Light and dark are both first-class and set before paint.

**Key Characteristics:**
- One brand color, desert gold: the primary action, the active item, keyboard focus, the mark.
- Warm near-neutral grounds; borders are translucent ink, so edges read on any surface.
- A serif voice (Prociono) on titles over a grotesk interface (Host Grotesk).
- Flat surfaces; depth from tonal steps and one hairline shadow.
- Standard scales only: Tailwind spacing, type, durations and z-index, shadcn radius.

## Colors

Warm near-neutral grounds and exactly one chromatic brand color. Any other hue
on a screen is a status color or a mistake.

### Primary
- **Desert Gold** (`primary`): primary buttons, the switch track, the active
  item, the mark. Text on it is always the ink (8.9:1).
- **Deep Gold** (`primary-strong`): gold as text or icon on a neutral surface,
  the paid-path cue, and the focus `ring` (4.0:1 on the page). In dark it equals
  the fill gold, which already reads on the night ground.

### Neutral
- **Page** (`background`) and **Ink** (`foreground`).
- **Card** (`card`, `popover`): surfaces a step above the page.
- **Secondary** and **Muted** (`secondary`, `muted`, `accent` = `muted`): quiet
  fills, skeletons, hovers.
- **Muted Ink** (`muted-foreground`): secondary text, metadata, placeholders,
  decorative icons.
- **Hairline** (`border`) and **Field Edge** (`input`): ink at 7% and 12% by day,
  white at 6% and 8% by night. Translucent so a chip on the gold glow keeps its
  edge.
- **Field** (`field`, `field-hover`): the fill of inputs, select triggers and
  outline buttons, a step below white by day and above black by night.

### Status
- **Success**, **Warning**, **Info**, **Destructive**: data, never decoration.
  Warning is pushed to orange (hue 45) so it never reads as the gold (hue 78).

### Named Rules
**The One Color Rule.** Desert gold is the only brand hue. No second accent.

**The Two Inks Rule.** Text is `foreground` or `muted-foreground`. Never an
opacity of either (`text-foreground/70`): if a third tone seems needed, the
hierarchy is wrong.

**The Gold-Holds-Ink Rule.** Text on a gold fill is always the ink, never white.
Gold as text on a neutral uses `primary-strong`, never the fill gold.

## Typography

**Display Font:** Prociono (with Georgia, serif). A roman serif, Regular only.
**Body Font:** Host Grotesk (with system-ui, sans-serif). Variable, 300 to 800.
**Mono Font:** Geist Mono (with ui-monospace).

**Character:** A literary serif for titles over a warm, dense grotesk for the
work. The serif gives the product its edition feel; the grotesk keeps the tool
from reading as corporate or costume.

### Hierarchy
- **Display** (Prociono 400, `text-display`, `leading-display`): the home catchline only.
- **Headline** (Prociono 400, `text-3xl` page titles, `text-xl` pane titles).
- **Title** (Host Grotesk 500, `text-base`): item, card and dialog titles.
- **Body** (Host Grotesk 350, `text-sm`): the interface. Bold inside text is 600.
- **Reading** (Host Grotesk 350, `text-base`, `leading-relaxed`, `max-w-prose`): chapter text.
- **Label** (Host Grotesk 500, `text-2xs`, wide tracking, uppercase, muted): the `eyebrow` utility.
- **Miniature** (`text-3xs`): key caps and the home sketch's labels. Never interface text.
- **Mono** (Geist Mono, `text-xs`): durations, counts, the Markdown twin.

### Named Rules
**The Display Restraint Rule.** Prociono sets titles only, at Regular. Never
body, buttons, labels, controls or data.

**The Quiet Caps Rule.** Uppercase tracked labels are the `eyebrow` utility,
for section labels inside a pane or a menu, never as a kicker above a page heading.

## Layout

One workspace under a sticky header (`h-header`, 3.5rem): a work pane on the
left and the compilation pane on the right (`w-pane`, 400px), each scrolling on
its own. Settings takes the compilation pane's place rather than opening a page.
Below `lg` the panes stack and the pane footer (Compile, Download) is fixed to
the bottom of the screen. About is a single centred column.

Spacing is Tailwind's 0.25rem grid, no arbitrary values. The rhythm is
1, 2, 3, 4, 6, 8 (4 to 32px); half steps (1.5, 2.5, 3.5) belong to dense
controls. Breakpoints are Tailwind's defaults. Layers use Tailwind's z steps:
background `-z-10`, raised `z-10`, sticky `z-20`, pane `z-30`, overlays `z-50`.

## Elevation & Depth

Flat by default. Depth comes from tonal steps (white surfaces on the warm page by
day, a lighter step on the near-black by night) plus a 1px border.

### Shadow Vocabulary
- **Surface hairline** (`shadow-surface`, from `--surface-lift`): fields, chips,
  outline buttons, small surfaces. A 1px shadow by day; a faint top highlight by night.
- **Overlay** (`shadow-md`, `shadow-lg`): tooltips, select popups, menus, dialogs.
  Standard shadcn values.

### Named Rules
**The Flat-By-Default Rule.** At rest, a surface gets the hairline at most. Panes
carry a border, never a cast shadow. Real shadows only on what floats.

## Shapes

One radius base, `--radius` (0.625rem), with the shadcn scale derived from it.
Buttons, inputs and cards use `rounded-lg`; badges are pills (`rounded-4xl`);
checkboxes and key caps use `rounded-sm`. Icons follow the text they sit in:
`size-3` with `text-xs`, `size-3.5` in dense rows, `size-4` by default, `size-5`
for logos and spinners, `size-6` for empty states.

## Components

shadcn / Base UI primitives in `components/ui/`, styled through tokens. Their
structure stays upstream; the few deliberate departures are listed here.

### Buttons
- **Primary** (`default`): gold fill, ink text, `h-10`. The one committing action
  per screen (Compile, Download). Hover deepens the gold; disabled is plain grey,
  never faded gold.
- **Outline** for secondary actions (Copy, Connect a model), **Ghost** for
  tertiary ones (New compilation), **nav** for icon buttons in the header and rows.
- **Press:** scales to 97%. **Focus:** `ring-3` in `ring/50`.
- A button whose label changes (Copy / Copied) keeps one width.

### Inputs / Fields
- **Style:** `field` fill, `input` edge, `rounded-lg`, `h-10` (`h-14` for the home search).
- **Focus:** the standard gold ring, like every control.
- Fields don't react to hover.

### Checkbox and Switch
- **Checkbox:** checked in ink, not gold, with an edge at 35% ink so the box
  reaches 3:1 against the page. A review list checks every row; a column of gold
  squares would outshout the one gold action.
- **Switch:** gold track when on. Used only for the AI polish master toggle.

### Rows
- Every clickable row (search results, review items, contents, recent
  compilations) hovers with `muted/50`, the shadcn table-row convention.

### Signatures
- **Page glow** (`--glow`, `.glow-layer`): a still glow rising from the bottom,
  desert gold on the left, muted tan on the right, a warm light on the left edge.
  Full strength on the home page at rest, a 15% trace elsewhere.
- **Grain** (`components/grain.tsx`): fractal noise over the page at 5%.
  Decorative, `aria-hidden`, never lowers text contrast.
- **Tool sketch** (`components/tool-sketch.tsx`): the home illustration, three
  sources threaded into one book. Illustration values (its shadows, its tilt)
  stay inside the component.

### Motion
One house curve, `ease-out-quint`, for transitions and the flow-card morph;
`ease-out-expo` for one-shot reveals. Durations are Tailwind's steps: 150ms for
controls, 200ms cross-fades, 300ms morphs, 500ms for the theme reveal, 700 to
1000ms for one-shot arrivals. Every animation has a `prefers-reduced-motion`
alternative.

## Do's and Don'ts

### Do:
- **Do** use role tokens through their utilities, and add a token (by role) before hard-coding a value.
- **Do** stay on Tailwind's standard scales; extend the theme rather than writing an arbitrary value.
- **Do** keep desert gold to the primary action, the active item, keyboard focus and the mark.
- **Do** keep the ink on every gold fill, and text at 4.5:1 or more.
- **Do** rebuild the registry (`pnpm registry:build`) and update `registry.json` when a token changes.
- **Do** ship a reduced-motion alternative for every animation.

### Don't:
- **Don't** write opacity variants of the inks (`text-foreground/70`, `bg-foreground/5`); use a role.
- **Don't** introduce a second brand color, or use gold where a status belongs.
- **Don't** put white text on gold, or the fill gold as text on the light page.
- **Don't** add resting shadows, side-stripe borders, dashed panels, or an eyebrow above a page heading.
- **Don't** wear a costume: no papyrus, sepia, parchment, and no animated decorative background.
