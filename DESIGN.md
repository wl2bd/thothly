---
name: Thothly
description: Read anything like a book. Near-neutral grounds carrying one strong color, desert gold.
colors:
  background: "oklch(0.975 0 0)"
  foreground: "oklch(0.16 0.015 68)"
  card: "oklch(1 0 0)"
  secondary: "oklch(0.955 0 0)"
  muted: "oklch(0.965 0 0)"
  muted-foreground: "oklch(0.5 0 0)"
  border: "oklch(0.945 0 0)"
  input: "oklch(0.905 0 0)"
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
  border-dark: "oklch(1 0 0 / 6%)"
  input-dark: "oklch(1 0 0 / 8%)"
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
    fontWeight: 350
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
  button-outline:
    backgroundColor: "{colors.card}"
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

> **Status (2026-09-29).** Re-derived from the shipped code on the
> `design-rework` branch (`frontend/app/globals.css` is the source of truth for
> every value). This records what ships, not an aspiration. Where the two
> disagree, the code wins and this file is stale.

## Overview

**Creative North Star: "Gold Leaf."**

One precious metal on a quiet ground. By day a light neutral grey page with
pure white surfaces on it; by night a true near-black (chroma 0) with a step
lighter for surfaces. No tint in the grounds, borders or recessed fills: the tan
of 2026-09-28 was dropped the next day ("too much colour"). Against them, one
strong color does the talking: **desert gold**, the brand's action color. It is
the heir of the name (Thoth, writing, the gilt of an illuminated page), executed
as a flat, bold, modern color rather than a texture.

The product is one workspace, not a landing followed by a tool: the home page is
the tool (search on the left, the compilation pane on the right), and About is a
plain text page. The expressive layer is small: a still two-tone glow rising
from the bottom of the page, a faint grain over it, the serif on titles. Gold
appears on the one primary action per screen, the active tab, the paid-path cue
and the mark. Everything else is plain shadcn / base-ui primitives on the token
layer.

Light and dark are both first-class. The theme is set before paint.

**Key Characteristics:**
- One brand color, desert gold: the primary action, the active tab, keyboard focus, the mark.
- Grounds: light grey page with white surfaces (light), chroma-0 near-black (dark).
- A serif voice (Prociono) on titles over a grotesk UI (Host Grotesk).
- Flat surfaces; depth from tonal steps and one hairline (`shadow-surface`).
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
| `border`, `input` | Hairlines and field strokes. |
| `primary` / `primary-foreground` | Desert gold fill and the ink on it. |
| `primary-strong` | Gold as text or icon on a neutral surface; also `ring`. |
| `destructive`, `success`, `warning`, `info` | Status, data only. |
| `surface-lift` | The one hairline shadow under a surface (`shadow-surface`). |
| `glow` | The page glow: two radial gradients, gold left, muted tan right. |

### Primary
- **Desert Gold** (`--primary`, `oklch(0.82 0.145 80)` light, `oklch(0.71 0.135 78)`
  dark): primary buttons, the switch track, the current/active item, the mark,
  the funnel node. Text on it is always the ink (8.9:1).
- **Deep Gold** (`--primary-strong`, `oklch(0.6 0.15 75)` light, equal to the
  primary on dark): the gold when it has to read on a neutral surface: icons,
  the paid-path badge text, the select check, link hover, and the focus ring
  (4.0:1 on the page). On the night ground the fill gold already reads.

### Neutral
Chroma 0 everywhere except the ink, which keeps a faint warm pull.
- **Page** (`--background`, `oklch(0.975 0 0)` / `oklch(0.13 0 0)`).
- **Ink** (`--foreground`, `oklch(0.16 0.015 68)` / `oklch(0.97 0 0)`).
- **Card** (`--card`, `oklch(1 0 0)` / `oklch(0.17 0 0)`): pure white surfaces
  on the grey page; popovers share it.
- **Secondary** (`oklch(0.955 0 0)` / `oklch(0.22 0 0)`).
- **Muted** (`oklch(0.965 0 0)` / `oklch(0.22 0 0)`) with **Muted Ink**
  (`oklch(0.5 0 0)` / `oklch(0.7 0 0)`).
- **Hairline** (`--border`, `oklch(0.945 0 0)` / white at 6%).
- **Field edge** (`--input`, `oklch(0.905 0 0)` / white at 8%): firmer than a
  divider so a field doesn't melt into the white.

### Status
- **Success** `oklch(0.5 0.12 150)`, **Warning** `oklch(0.53 0.16 45)`, **Info**
  `oklch(0.52 0.13 255)`, **Destructive** `oklch(0.52 0.21 27)` (light values;
  dark lifts them to L 0.68 to 0.78). Warning is pushed to orange (hue 45) so it
  never reads as the gold (hue 78). Used as 10%-alpha chips with the full color
  as text.

### Named Rules
**The One Color Rule.** Desert gold is the only brand hue. The four status
colors are data, not decoration. No second accent.

**The Quiet Ground Rule.** Grounds, surfaces, borders and recessed fills are
chroma 0 in both modes. No cream, sand, tan or parchment. The only warm tone
outside the gold is the right half of the page glow.

**The Gold-Holds-Ink Rule.** Text on a gold fill is always the ink, never white.
Gold as text on a neutral uses `primary-strong`, never the fill gold.

## Typography

**Display Font:** Prociono (with Georgia, serif). A roman serif, Regular only,
self-hosted.
**Body / UI Font:** Host Grotesk (with system-ui, sans-serif). Variable, runs the
whole tool.
**Mono Font:** Geist Mono (with ui-monospace). Durations, counts, the Markdown twin.

**Character:** A literary serif voice for titles over a warm, readable grotesk
for the work. The display face gives the product its "edition" feel; the grotesk
keeps the tool from reading as either corporate or costume. A switch to more
premium faces is under discussion (2026-09-29).

### Hierarchy
- **Display** (Prociono 400, `text-display` 2.75rem rising to 3.75rem at `sm`,
  `leading-display` 1.1, `tracking-tight`): the home catchline ("Make anything
  readable"), folded away once results show.
- **Headline** (Prociono 400): `text-3xl` page titles (About, the reader's
  chapter title); `text-xl` pane titles (the compilation's name, the AI models panel).
- **Title** (Host Grotesk 500, 1rem): item titles, card and dialog headers.
- **Body** (Host Grotesk 350, a notch under Regular since the face is dense; bold inside it is 600; `text-sm` 0.875rem; About prose adds
  `leading-relaxed`; the catchline's subtitle is `text-lg`, `leading-snug`).
- **Reading** (Host Grotesk 350, `text-base` 1rem, leading 1.65, ink, `max-w-prose`):
  the chapter text in the reader. Links underline at 35% of the text color, full
  on hover. The review preview keeps a compact muted `text-sm` excerpt.
- **Label** (Host Grotesk 500, `text-xs` 0.75rem): badges, metadata, buttons `sm`.
- **Mono** (Geist Mono, `text-xs`): durations, counts, technical detail.
- **Miniature** (`text-2xs` 0.625rem): the `eyebrow` labels and keyboard-key
  hints (mono, tracked capitals). Never other UI text.

### Named Rules
**The Display Restraint Rule.** Prociono sets titles only: the catchline, page
titles, pane titles, a chapter title. Never body, buttons, labels, form
controls or data, and never a bolder weight (it ships Regular; the browser would
fake-bold it).

**The Quiet Caps Rule.** Uppercase tracked labels are the one `eyebrow` utility
(see Control scale), for small section labels inside a pane or a menu, never as
a kicker above a page heading.

## Layout

Every screen is the same workspace under the app header (`Workspace` in
`components/compilation-pane.tsx`): a work pane on the left and the compilation
pane on the right, `lg:grid-cols-[minmax(0,1fr)_400px]`, each scrolling on its
own at full viewport height. The work pane centres its content in `max-w-3xl`
with `p-4` / `sm:p-8`; the compilation pane pads `px-6 py-6` and pins its action
footer (Compile, Download) at its bottom. Below `lg` the panes stack and the
footer is fixed to the bottom of the screen, within reach of the thumb. The one
text page (About) is a single centred column. AI models is not a page: the
header opens it as a side panel (`Sheet`, right, full width on a phone, 448px
from `sm`) over whatever screen is open. The pane carries the
`flow-card` view-transition name, so it morphs across the flow instead of
hard-cutting. Spacing follows Tailwind's 0.25rem scale. Breakpoints are
Tailwind's defaults (`sm` 640, `md` 768, `lg` 1024).

## Elevation & Depth

Flat by default. Depth comes from tonal steps: white surfaces on the grey page
in light, a step lighter than the near-black in dark, plus a 1px border.

### Shadow Vocabulary
- **Surface hairline** (`--surface-lift`, `shadow-surface`: `0 1px 1px rgb(0 0 0 / 0.03)`
  in light; a faint top highlight plus a 1px shadow in dark): fields, chips and
  small surfaces.
- **Overlay** (Tailwind `shadow-md` to `shadow-xl`): tooltips, select popups,
  menus, dialogs. Standard shadcn values.

### Named Rules
**The Flat-By-Default Rule.** At rest, a surface gets the hairline at most. Panes
carry a border, never a cast shadow. Real shadows only on what floats (popups,
menus, dialogs).

## Shapes

One radius base, `--radius: 0.625rem`, with the shadcn scale derived from it
(`sm` 0.375, `md` 0.5, `lg` 0.625, `xl` 0.875 … `4xl` 1.625rem). Buttons, inputs
and cards use `rounded-lg`; badges are pills (`rounded-4xl`); tiny marks (the
search highlight, favicons, the duration chip) use `rounded-xs`.

## Components

shadcn / base-ui primitives (`components/ui/`) re-skinned by the token layer.
Leave their internals conventional; brand lives in the tokens and the signatures.

### Buttons
- **Primary:** gold fill, ink text, `h-10`, `rounded-lg`, `text-sm` medium.
  The one committing action on each screen (Compile, Download).
- **Outline** for secondary actions (Copy, Connect a model), **Ghost** for
  tertiary ones (New compilation). No grey `secondary` button.
- **Focus:** `ring-3` in `ring/50` (deep gold on light, gold on dark). Fields differ, see below.

### Badges
- **Content tag** (review rows): `secondary` pill naming what was retrieved
  (Transcript, Raw captions, Web text, From audio).
- **Paid path:** `bg-primary/10` with `text-primary-strong` and a coin icon: the
  one cue that a step costs money.
- **Status:** success / warning / info / destructive at 10% alpha.

### Cards, inputs, controls
- **Card / panel:** `bg-card`, 1px solid border, `rounded-lg`. Never nested, never dashed.
- **Input:** card ground, hairline stroke, placeholder in muted ink (≥ 4.5:1).
- **Field focus:** fields (Input, Select trigger) focus in neutral ink, not gold:
  `border-foreground/45` + `ring-3 ring-foreground/6`, also while a Select is open.
  A field takes focus on every click, so a gold halo there reads as an alarm.
  The gold ring stays for keyboard focus on buttons and links.
- **Checkbox:** checked in ink (`bg-foreground`, the tick in the page color), not gold.
  A review list checks every row, and a column of gold squares outshouts the one
  gold action (Compile).
- **Switch:** gold track when on; used only for the "AI polish" master toggle.
  Checkboxes everywhere else.

### Signatures
- **Page glow** (`--glow`, `.glow-layer` in `app/layout.tsx`): a still two-tone
  glow rising from the bottom of the page, desert gold on the left and a muted
  tan on the right. Full strength on the home page at rest, a 15% trace
  everywhere else, eased between the two. No animation: animated decorative
  backgrounds were tried and rejected on 2026-09-29.
- **Grain** (`components/grain.tsx`): fractal noise over the whole page at 5%,
  and on the wordmark. Decorative, `aria-hidden`, never lowers text contrast.

Retired and deleted on 2026-09-29: the hieroglyph rain, the rotating gold frame
around the search field and the stone tablets, with their tokens and fonts
(Literata, Noto Sans Egyptian Hieroglyphs, Noto Serif Display Thin).

### Motion
One house curve, `ease-out-quint` (`cubic-bezier(0.22, 1, 0.36, 1)`), for every
transition and the flow-card morph (300ms group, 220ms cross-fade; slower when
returning home). `ease-out-expo` is reserved for one-shot reveals. Loading reads
as a progress bar with a counter and a sheen on the row in progress, never
stacked spinners. Every animation has a `prefers-reduced-motion` alternative.

## Control scale (2026-09-29)

- Two control heights only: 40px (`h-10`) for every field, dropdown and button; 32px (`size="sm"`) for compact inline controls (sort, example chips, actions inside a row).
- Three button styles: gold `default` (the one primary action per surface), `outline` (secondary), `ghost` (tertiary, e.g. New compilation). No grey `secondary`.
- A disabled primary button is plain grey, never faded gold. Hover deepens the gold.
- A button whose label changes (Copy / Copied) keeps one width: both labels share one grid cell.
- Type sizes: `2xs` eyebrows, `xs` meta, `sm` interface, `base` reading, `xl` pane titles, `3xl` page titles. Serif (`font-display`) names content (titles, headings), never small list rows.
- Small section labels use the `eyebrow` utility only (2xs, medium, wide tracking, uppercase, muted): Contents, menu groups, Recent compilations, Try a search, the pane's status. Interface weight is `font-medium`; `semibold` only inside content.
- Shadows: one hairline (`shadow-surface`) on surfaces; panes carry a border, no cast shadow.

## Interaction (2026-09-29)

- **Links:** every inline text link and link-button uses the `text-link` utility: an underline at 35% of the text color, full on hover. The color comes from the context (ink, or muted brightening to ink). Header links are the exception: no underline, muted to ink.
- **Rows:** every clickable row (search results, review items, AI roles, the reader's contents, recent compilations, the sort trigger) hovers with one 5% ink wash, `hover:bg-foreground/5`. Not `bg-muted`: in dark it equals `secondary`.
- **Fields** (Input, Select trigger) don't react to hover; they answer focus only.
- **Buttons:** shadcn hovers (gold deepens, outline and ghost take `muted`). Icon-only buttons in the header, rows and fields are `nav` variant, `icon-sm` (32px), and shift from muted to ink.
- **Icons:** Lucide only, one stroke. A bin deletes (history, a staged source), a cross clears (a search field, a dialog), + / − expand and collapse a source group, an eye opens a preview, an external-link mark sits on menu items that leave the site.

## Do's and Don'ts

### Do:
- **Do** use role tokens through their utilities; add a token (by role) before
  hard-coding a value, and extend a scale rather than making an exception.
- **Do** make desert gold the one brand color: the primary action, the active tab, keyboard focus, the mark.
- **Do** use `primary-strong` for gold text or icons on a neutral surface.
- **Do** keep the ink on every gold fill, and body and placeholder text ≥ 4.5:1.
- **Do** keep Prociono to titles.
- **Do** ship a reduced-motion alternative for every animation.

### Don't:
- **Don't** build a cold enterprise dashboard or a generic AI SaaS page: no
  gradient hero, glassy cards, hero-metric grid, fluorescent accents, gradient text.
- **Don't** wear the costume: no papyrus, sepia or parchment, and no animated
  decorative background.
- **Don't** introduce a second brand color, or use gold where a status belongs.
- **Don't** put white text on gold, or the fill gold as text on the light page.
- **Don't** fork the shadcn primitives' internals to restyle them; change tokens.
- **Don't** add resting shadows, side-stripe borders, dashed panels, or a tracked
  eyebrow above a page heading.
