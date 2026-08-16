# Landing / app split — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Thothly's front page into a landing (`/`) and a tool (`/app`), and give the tool a history of what you have already compiled.

**Design brief:** `docs/superpowers/specs/2026-08-02-landing-app-split-design.md` — read it before Task 2. It carries the register split, the nine states, the storage contract and the copy rules.

**Architecture:** `hero-search.tsx` (1040 lines) holds two different things: the landing's visual fold, and the whole staging machine. The fold stays; the machine moves to a new `Compose` component on `/app`. The landing's field keeps its input and, on submit, navigates to `/app?q=…`, so the split costs no click. History lives in `localStorage` as snapshots (not bare ids) because the public backend cold-starts in 43 seconds and the list must render before the network answers.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, Tailwind v4, base-ui primitives. No new dependencies.

## Global Constraints

- **This is NOT the Next.js you know.** Read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing frontend code (`frontend/AGENTS.md`). The codebase already uses React's `ViewTransition` and `transitionTypes` on `<Link>`; those are correct here and must not be "fixed".
- User-facing copy is **English**, with **no em-dashes (—)**, never exposes the word "LLM", and is factual-neutral: no "⚠️", no blame, no exclamation. The deliverable is a **compilation**.
- **Comments explain WHY, not what.** This codebase's comments are long-form rationale paragraphs. Match that density and voice.
- **No new dependencies.** No new fonts, no state library, no test runner.
- `/app` is **product register**: no decorative motion, no arrival choreography, no display fonts in UI labels, Restrained color (gold only for the primary action and current selection). `/` is unchanged brand register.
- Work on branch **`landing-app-split`**. Do not push to `main`: `main` auto-deploys the public demo.
- Verification is `cd frontend && pnpm lint`, `pnpm typecheck`, `pnpm build`. **There is no frontend test runner and this plan does not add one** — it was excluded from the agreed scope. Every task therefore ends with a stated manual check; Task 7 runs the full state table against a live app.
- Commit message convention: end every message with these two trailer lines:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BpuHemK4Z57GtCYCxzYQk4
  ```

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `frontend/lib/history.ts` | The localStorage contract: read, record, forget, prune, cap | Create |
| `frontend/components/compose.tsx` | The staging machine: search, results, filters, staged sources, create job | Create (moved out of `hero-search.tsx`) |
| `frontend/components/compilation-history.tsx` | The list of past compilations and its empty / loading / stale states | Create |
| `frontend/app/app/page.tsx` | The `/app` route: server shell, metadata, header | Create |
| `frontend/components/hero-search.tsx` | The landing's hero fold and a field that navigates | Modify: drops ~800 lines |
| `frontend/app/jobs/[id]/page.tsx` | The job screen | Modify: records the job in history on load |
| `frontend/components/hieroglyph-rain.tsx` | The landing's glyph rain | Modify: cache the static corridor rules |

`Compose` is named for the moment `PRODUCT.md` already names: "**Composing** (in-app, focused): at their desk, gathering videos/podcasts/articles/playlists and deciding what makes the book."

---

### Task 1: The history store

A pure module with no React in it, so the storage contract can be reasoned about on its own and the components that use it stay about rendering.

**Files:**
- Create: `frontend/lib/history.ts`

**Interfaces:**
- Consumes: `JobResponse` and `JobStatus` from `@/lib/api`.
- Produces:
  - `interface CompilationSnapshot { id: string; title: string | null; createdAt: string; status: JobStatus }`
  - `readHistory(): CompilationSnapshot[]` — newest first, `[]` on a missing/corrupt/old-version key
  - `recordCompilation(job: Pick<JobResponse, "id" | "book_title" | "created_at" | "status">): void` — upsert, moves to front, caps at 25
  - `forgetCompilation(id: string): void`
  - `HISTORY_CAP = 25`

- [ ] **Step 1: Write the module**

```ts
import type { JobResponse, JobStatus } from "@/lib/api";

// What the browser remembers about a compilation you made. Deliberately a
// SNAPSHOT rather than a bare id: the public backend cold-starts in about 43
// seconds, and a list that needs the network to render leaves the app blank for
// that long. With the title and status stored, the list paints immediately and
// the network only corrects it.
export interface CompilationSnapshot {
  id: string;
  title: string | null;
  createdAt: string;
  status: JobStatus;
}

// Versioned so a later schema change degrades to an empty list instead of
// throwing on data this build can't read.
const KEY = "thothly.compilations.v1";

// Enough to cover the compilations anyone actually returns to, and a hard bound
// on both storage and the refresh burst the app fires on mount.
export const HISTORY_CAP = 25;

export function readHistory(): CompilationSnapshot[] {
  // Server-rendered passes have no storage; callers render a skeleton until
  // mount rather than branching on this.
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter rather than trust: a half-written or hand-edited entry should cost
    // that entry, not the whole list.
    return parsed.filter(
      (e): e is CompilationSnapshot =>
        !!e && typeof e === "object" && typeof (e as CompilationSnapshot).id === "string",
    );
  } catch {
    // Storage can throw outright (Safari private mode, a disabled setting).
    // History is a convenience; losing it must never break the page.
    return [];
  }
}

function write(entries: CompilationSnapshot[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, HISTORY_CAP)));
  } catch {
    /* quota or disabled storage; the app works without the list */
  }
}

// Upsert, newest first. Called when a compilation is created AND whenever a job
// screen loads, so a link someone shared with you joins your history the way a
// browser would treat a page you visited.
export function recordCompilation(
  job: Pick<JobResponse, "id" | "book_title" | "created_at" | "status">,
): void {
  const entry: CompilationSnapshot = {
    id: job.id,
    title: job.book_title,
    createdAt: job.created_at,
    status: job.status,
  };
  write([entry, ...readHistory().filter((e) => e.id !== job.id)]);
}

export function forgetCompilation(id: string): void {
  write(readHistory().filter((e) => e.id !== id));
}
```

- [ ] **Step 2: Verify it compiles and the types line up**

Run: `cd frontend && pnpm typecheck`
Expected: clean. A failure here means `JobResponse`'s field names differ from what `recordCompilation` picks; check `frontend/lib/api.ts` and match it rather than casting.

- [ ] **Step 3: Verify the contract by hand in the browser**

With the dev server running, open any page and in the console:

```js
localStorage.setItem('thothly.compilations.v1', 'not json')
```

then reload. The page must render normally (the module swallows the parse error). Then check `readHistory()` returns `[]` rather than throwing.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/history.ts
git commit -m "feat(ui): remember compilations in the browser"
```

---

### Task 2: Split the staging machine out of the landing

The biggest task, and **predominantly a move**. Almost nothing is rewritten: state, effect, handlers, panels and sub-components go across intact. Only the seams change.

**Files:**
- Create: `frontend/components/compose.tsx`
- Create: `frontend/app/app/page.tsx`
- Modify: `frontend/components/hero-search.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 yet.
- Produces: `Compose({ initialQuery }: { initialQuery?: string })` from `@/components/compose`.

- [x] **Step 1: Create `compose.tsx` by moving, not rewriting**

Move from `hero-search.tsx` into a new `"use client"` component `Compose`, **verbatim**:

- Every piece of state from `hero-search.tsx:90-116` (`query` through `viewingSources`), plus `inputRef` and `pickedByPointer` (`:84-88`)
- The debounced search effect (`:139-192`)
- `toggleResultStaged`, `stageSources`, `onSubmit`, `removeStaged`, `resetStaged`, `clearQuery`, `onCompile` (`:198-306`)
- The derived values (`:308-327`)
- The `<ViewTransition name="flow-card">` + `<Card>` block and both panel faces and both footers (`:375` through the card's close)
- The sub-components and helpers below the main component: `Kbd`, `NewSearchShortcut`, `SearchResults`, `TypeFilter`, `sortResults`, `SortSelect`, `SearchSourcesHint`, `formatDuration`, `looksLikeUrl`, `normalizeUrl`, `detectType`, `detectSource`, `prettyUrl`
- The `StagedSource` interface (`:60-71`) and `SEARCH_DEBOUNCE_MS` (`:73`)

Two seams change:

1. `useState("")` for `query` becomes `useState(initialQuery ?? "")`, so a query handed over from the landing searches on arrival. Comment why.
2. The card's `max-h` juggling (`:381-387`) referenced the hero fold's height (`calc(100svh-22rem)`), which no longer exists on this surface. Replace with `max-h-[calc(100svh-16rem)]` in both branches' place and note in a comment that the reserved space is now the slim header plus the field, not a hero.

Delete every moved symbol from `hero-search.tsx`.

- [x] **Step 2: Reduce the landing's hero to a field that navigates**

In `hero-search.tsx`, `HeroSearch` keeps: the `<section id="top">` shell and its gradient, `HieroglyphRain`, `Grain`, the scrim, the heading block (`:361-373`), the heads-up paragraph, and the scroll cue. The card collapses to the input alone.

Because `showResults` and `staged` no longer exist here, every conditional that read them resolves to its pristine branch: the section keeps `py-16 sm:py-20`, the inner stack keeps `gap-10`, and the heads-up and scroll cue render unconditionally.

The new submit handler, replacing `onSubmit`:

```tsx
  const router = useRouter();
  const [query, setQuery] = useState("");
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
```

Keep the `<Input>`'s existing ref, focus/blur handlers and the cross-fading `SearchIcon`. Drop the Escape-to-clear `onKeyDown` (there is no result list to escape from here) and the `viewingSources` reset in `onChange`.

Add a visible submit affordance: the field alone with no button gives a pointer user nothing to click. A `Button type="submit"` with the label `Start` sits inside the form after the input.

- [x] **Step 3: Create the `/app` route**

`frontend/app/app/page.tsx` — a Server Component shell, mirroring how `app/page.tsx` composes a server shell around client islands:

```tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Logotype } from "@/components/brand";
import { Compose } from "@/components/compose";
import { GitHubStar } from "@/components/github-star";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Compose · Thothly",
  // The landing is the page worth finding; this one is a workspace behind it,
  // and a search result landing a stranger on a bare field would explain nothing.
  robots: { index: false, follow: true },
};

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <main className="flex min-h-screen justify-center p-8 sm:p-12">
      <div className="flex w-full max-w-xl flex-col gap-10 py-12">
        {/* A workspace header, not the landing's: the identity and the two
            global controls, without the section navigation. The logotype goes
            home, which is where the story lives. */}
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Logotype className="h-8 w-auto" title="Thothly" />
          </Link>
          <div className="flex items-center gap-2">
            <GitHubStar />
            <ThemeToggle />
          </div>
        </header>
        <Compose initialQuery={q} />
      </div>
    </main>
  );
}
```

`searchParams` is a Promise in Next 16 and must be awaited. Confirm the current signature against `frontend/node_modules/next/dist/docs/` before writing it, and against `app/jobs/[id]/page.tsx` which already handles async route inputs.

- [x] **Step 4: Verify**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm build`
Expected: all three clean.

Then, with both dev servers running, check by hand:
- `/` renders the hero with no results panel, and its field plus Start navigates to `/app`
- typing "climate" on `/` and submitting lands on `/app?q=climate` with the search already running
- `/app` alone shows the field and searches in place
- staging a source and pressing Review still creates a job and lands on `/jobs/:id`

- [x] **Step 5: Commit**

```bash
git add frontend/components/compose.tsx frontend/components/hero-search.tsx "frontend/app/app/page.tsx"
git commit -m "feat(ui): move the staging machine to its own route"
```

---

### Task 3: The compilations list

**Files:**
- Create: `frontend/components/compilation-history.tsx`
- Modify: `frontend/app/app/page.tsx` (render it), `frontend/components/compose.tsx` (report whether a query is active)

**Interfaces:**
- Consumes: `readHistory`, `forgetCompilation`, `CompilationSnapshot` (Task 1); `fetchJob`, `ApiError` from `@/lib/api`.
- Produces: `CompilationHistory({ hidden }: { hidden: boolean })`.

- [x] **Step 1: Build the component**

A `"use client"` component that:

1. Holds `entries: CompilationSnapshot[] | null` (`null` = not yet read from storage) and `stale: boolean`.
2. On mount, `setEntries(readHistory())`. Reading in an effect rather than during render is what keeps the server and client markup identical; the `null` phase renders the skeleton.
3. Then refreshes: `await Promise.allSettled(entries.map(e => fetchJob(e.id)))`.
   - A fulfilled result updates that row's `title` and `status` and rewrites storage.
   - An `ApiError` with `status === 404` **removes** the entry: the server no longer has it.
   - Any other rejection leaves every entry alone and sets `stale`. A network error must never prune the list.
4. Renders one of:
   - **`entries === null`** — skeleton rows. Their count comes from `readHistory().length` measured at mount, so the page does not jump when the real rows land.
   - **`entries.length === 0`** — the orientation block (Step 2).
   - **otherwise** — an `<h2>` "Your compilations" and a `<ul>` of rows.
5. Renders nothing at all when `hidden` is true.

A row is a `<Link href={/jobs/${id}}>` carrying the title (truncated; titles run to 100 characters), a relative date, and the status when it is not `completed`. Beside it, a discreet remove control: `<button aria-label="Forget this compilation">` calling `forgetCompilation(id)` and dropping the row locally. Its hit area must reach 24×24 CSS pixels — see `frontend/app/jobs/[id]/page.tsx` where the drag handle uses `inline-grid h-10 w-6 place-items-center` for the same reason.

When `stale`, a single quiet line under the list: `This list may be out of date.`

- [x] **Step 2: Write the empty state**

The product register asks for an empty state that teaches the interface, not one that says "nothing here". Copy:

> **Nothing compiled yet**
> Search above, or paste a link: a video, a podcast, an article, even a whole playlist or blog.
> [See how it works](/#how-it-works)

- [x] **Step 3: Wire it into `/app`**

`Compose` gains an `onQueryActiveChange?: (active: boolean) => void` callback, or `/app` lifts the "is a query active" flag. Prefer lifting nothing: give `Compose` the callback, and let `app/app/page.tsx` — which is a Server Component and cannot hold state — delegate to a small client wrapper that renders `Compose` and `CompilationHistory` together. Name it `components/app-surface.tsx`. The history is hidden whenever a query is active, so results and history never compete for the same column.

- [x] **Step 4: Verify**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm build`

Then by hand, with the backend **stopped**, seed storage in the console:

```js
localStorage.setItem('thothly.compilations.v1', JSON.stringify([
  { id: 'does-not-exist', title: 'Cold start check', createdAt: new Date().toISOString(), status: 'completed' }
]))
```

Reload `/app`. The row must appear immediately, and the stale line must follow. **The row must not disappear.** Then start the backend and reload: the row is now removed, because the id genuinely 404s.

- [x] **Step 5: Commit**

```bash
git add frontend/components/compilation-history.tsx frontend/components/app-surface.tsx "frontend/app/app/page.tsx" frontend/components/compose.tsx
git commit -m "feat(ui): show the compilations you already made"
```

---

### Task 4: Record compilations as they happen

**Files:**
- Modify: `frontend/components/compose.tsx` (on create), `frontend/app/jobs/[id]/page.tsx` (on load)

**Interfaces:** consumes `recordCompilation` (Task 1).

- [x] **Step 1: Record on creation**

In `Compose`'s `onCompile`, after `createJob` resolves and before `router.push`, call `recordCompilation(job)`. The job comes back with `id`, `book_title`, `created_at` and `status` already.

- [x] **Step 2: Record on load**

In `frontend/app/jobs/[id]/page.tsx`'s `applyJob` callback, call `recordCompilation(data)`. Every poll passes through `applyJob`, so the stored title and status track the live job for free, and a link someone shared with you joins your history the moment you open it.

- [x] **Step 3: Verify**

Compile something end to end. Then open `/app`: the compilation is in the list with its real title. Open a job URL in a fresh profile with empty storage: it appears in that profile's list too.

- [x] **Step 4: Commit**

```bash
git add frontend/components/compose.tsx "frontend/app/jobs/[id]/page.tsx"
git commit -m "feat(ui): record each compilation as it is made"
```

---

### Task 5: Stop redrawing the rain's static rules

**Files:**
- Modify: `frontend/components/hieroglyph-rain.tsx`

- [x] **Step 1: Cache the separators to an offscreen canvas**

`drawSeparators` (`hieroglyph-rain.tsx:232-251`) recomputes three summed sine octaves at every 4px of height for every corridor rule, then strokes them, **on every frame** — while the component's own comment states the phases are fixed. Measured at 1636×608 on 2026-08-02: 4,424 `lineTo` per frame, **6.19 ms of a 7.38 ms frame, 84% of the animation's cost**, producing an identical image each time.

Render them once into an offscreen canvas sized like the main one, rebuilt only in `resize()` (which is also where `sepPhases` changes), and `drawImage` it at the top of `draw()` in place of the `drawSeparators()` call.

Use a plain `document.createElement("canvas")` rather than `OffscreenCanvas`, matching the file's existing 2D-context approach and avoiding a support branch.

- [x] **Step 2: Verify the image is unchanged and the cost dropped**

Load `/` in a **foreground** tab (the loop pauses on a hidden tab, which is why a background tab measures zero). Compare against a screenshot taken before the change: the rules must be identical, including their eroded edges.

Then measure in the console:

```js
let n = 0, t = performance.now();
const raf = requestAnimationFrame(function f() { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); });
setTimeout(() => console.log('fps', Math.round(n / 2)), 2100);
```

- [x] **Step 3: Commit**

```bash
git add frontend/components/hieroglyph-rain.tsx
git commit -m "perf(ui): draw the rain's static rules once, not every frame"
```

---

### Task 6: Walk the state table

Verification only. The brief lists nine states; ship-ready means each has been seen.

- [ ] **Step 1: Run the three checks**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm build
```

- [ ] **Step 2: Walk every state**

With both servers running, confirm each: default (history, no query); empty (no history); searching; staging; loading history (throttle the network to see the skeleton); backend cold or unreachable (stop the backend); job gone (404); job still running (start a compile, close the tab, return to `/app`); and a query active (the history is hidden, not merely pushed down).

- [ ] **Step 3: Keyboard**

Complete this without a mouse: land on `/`, tab to the field, type, submit, arrive on `/app`, tab through the results, stage one, reach Review. Then on `/app` with history: tab to a row, open it, come back, tab to its remove control and use it. Every stop must show a visible focus ring.

- [ ] **Step 4: Commit anything the walk turned up**

If the walk was clean, there is nothing to commit. Say so rather than inventing a commit.

---

## Self-Review

**Brief coverage:** the register split and the slim header land in Task 2; the storage contract in Task 1; the nine states across Tasks 3 and 6; the empty state's teaching copy in Task 3 Step 2; `noindex` in Task 2 Step 3; the rain in Task 5; the 24×24 remove control in Task 3 Step 1.

**Type consistency:** `CompilationSnapshot` is defined once in `lib/history.ts` and imported everywhere. `recordCompilation` takes a `Pick<JobResponse, …>`, so both call sites (a freshly created job, a polled job) satisfy it without a cast.

**Known gap, deliberate:** there is no frontend test runner and this plan does not add one — excluded from the agreed scope. Every task therefore carries a manual check, and Task 6 walks the whole table. The storage module in Task 1 is the piece that would most benefit from unit tests if a runner is ever added.

**Open risk:** Task 2 moves roughly 800 lines. Its verification is behavioural rather than diff-reading; if the reviewer cannot confirm the move was faithful from the diff alone, `git diff --find-copies-harder` between the old and new files is the check to run.
