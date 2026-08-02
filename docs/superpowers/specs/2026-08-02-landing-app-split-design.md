# Landing / app split — design brief

> Produced by `/impeccable shape`. Design planning only; no code decisions past
> layout strategy. Hand to `/impeccable craft` or to `writing-plans`.

**Branch:** `landing-app-split`
**Date:** 2026-08-02

## 1. Feature summary

Thothly's front page does two jobs at once: it persuades a stranger, and it is
the workspace entrance. Those are different registers, and `PRODUCT.md` already
says so — "Default register is `product`; override to `brand` when working the
landing." They were simply sharing one URL.

This splits them. `/` stays the landing. `/app` becomes the tool: a search field
plus the compilations you have already made, remembered by your browser. The
staging machinery (search, results, filters, staged sources, job creation) moves
out of the landing's hero component and into `/app`.

## 2. Primary user action

On `/app`: **start a new compilation, or return to one you already made.**
Everything else on the surface is subordinate to those two.

## 3. Design direction

- **Color strategy: Restrained** for `/app`. This is the product register's
  floor. Desert gold is reserved for the primary action and the current
  selection; it is not decoration here. `/` is unchanged and stays expressive.
- **Scene sentence:** *A self-hoster at their desk, mid-afternoon, back for the
  third time this week to add two more episodes to a reading list they are
  building. They want the field ready and their last compilations in view, not a
  performance.* That forces: no arrival choreography, no decorative motion, the
  list reachable without scrolling. It does not force a theme — light and dark
  both stay first-class per `PRODUCT.md`.
- **Anchor references:** Raycast's root list (field on top, recent items
  beneath, no chrome); Linear's issue-list density; and, as the thing to move
  away from, Thothly's own current hero on the app path.
- **No per-surface override needed.** `PRODUCT.md` already declares the split.

## 4. Scope

- **Fidelity:** production-ready.
- **Breadth:** two routes, plus moving the staging machinery between them.
- **Interactivity:** shipped quality.
- **Time intent:** polish until it merges.

**Explicitly out of this pass**, each its own later spec: the landing hero's
proportions, its behavior on a phone, the commercial page's content, the
technical / bring-your-own-LLM page, and the skill.

## 5. Layout strategy

`/app` is a single column at the same `max-w-xl` the job screen already uses, so
the three surfaces of the flow share one measure.

- A slim header carries the identity — logotype linking home, theme toggle,
  GitHub star — but none of the landing's section navigation. This is a
  workspace, not a document.
- The search field sits at the top and is always present. It never scrolls away
  behind a hero.
- Beneath it, one of two things: the orientation block (no history) or **Your
  compilations** (history). They never both show.
- When a query is active, results take the space beneath the field and the
  compilations list steps aside rather than competing for the same column.
- Grain stays (static, cheap, carries the identity). The hieroglyph rain does
  not: the product register bans decorative motion that conveys no state, and
  `PRODUCT.md` sanctions the rain as a brand motif, which is the landing's job.

## 6. Key states

| State | What the user sees |
| --- | --- |
| **Default** — history, no query | Field, then Your compilations, newest first |
| **Empty** — no history, no query | Field, then a compact block that teaches what goes in (a video, a podcast, an article, a whole playlist) and links to how it works on `/`. It teaches the interface; it is not a second hero |
| **Searching** | Results replace the compilations list beneath the field |
| **Staging** | Picked sources accumulate; Compile is the one gold action |
| **Loading history** | Skeleton rows, sized to the number of snapshots — the count is known before the network answers |
| **Backend cold or unreachable** | Snapshots still render. A quiet line notes the list may be out of date. **No pruning on a network error** |
| **Job gone (404 on refresh)** | The row is dropped silently. The server wiped it; saying so would be noise |
| **Job still running** | The row shows that state and links back to the live screen. This is the main reason the list exists: you closed the tab mid-compile |

The cold-backend state is not hypothetical. The public backend cold-starts in
**43 seconds** (measured 2026-08-02). A list that needs the network to render
leaves `/app` blank for that long, which is why history is stored as a snapshot
rather than a bare list of ids.

## 7. Interaction model

- **Landing field:** type, Enter, land on `/app?q=…` with the search already
  running. The split costs no extra click — this is what keeps the immediacy
  that made the combined page work.
- **`/app` field:** the same component, searching in place.
- **Row click:** to `/jobs/:id`.
- **Row remove:** discreet, no confirmation dialog. It forgets the compilation
  in this browser and never touches the server. Modals are not used anywhere on
  this surface.

## 8. Content requirements

English, house voice, no em-dashes, factual and calm. New copy needed:

- Empty-state heading, one supporting line, and the link to how it works
- The **Your compilations** section label
- Row meta: relative date, plus state when it is not simply ready
- The stale-list line for a cold or unreachable backend
- The remove action's accessible label

Realistic ranges: **0 / 3 / 25** compilations. Titles run to 100 characters
(`BOOK_TITLE_MAX`), so rows must truncate rather than wrap to three lines.

## 9. Storage contract

```
localStorage["thothly.compilations.v1"]
[ { id, title, createdAt, status }, … ]   // newest first, capped at 25
```

- **Written** when a job is created, and when any job page loads — so a shared
  link you open joins your history, the way a browser would treat it.
- **Read** on mount; the list renders from snapshots before any request.
- **Refreshed** by one `GET /jobs/:id` per entry, in the background. 404 drops
  the entry; a network error leaves it alone.
- The key is versioned so a later schema change degrades instead of throwing.
- Nothing leaves the browser. On the public demo you see only your own, without
  the server having to filter anything — which matters, because `GET /jobs`
  returns every job on the server with no filter at all, and the README already
  warns the product is single-user with no auth.

## 10. Also in this pass

The hieroglyph rain's corridor rules are **static** — the component's own comment
says the phases are fixed — yet they are recomputed and re-stroked every frame:
4,424 `lineTo` per frame, **6.19 ms of a 7.38 ms frame, 84% of the animation's
cost**, for an identical image (measured 2026-08-02 at 1636×608). They get
rendered once to an offscreen canvas and blitted per frame.

It lives on `/`, not `/app`, but it is the fix for the symptom that started this
whole conversation, so it ships here.

## 11. Recommended references during implementation

`onboard.md` (the empty state is a first-run surface), `harden.md` (the state
table above is the work), `clarify.md` (new copy), `layout.md` (the column and
its rhythm), and `better-accessibility` for the list semantics and the remove
control.

## 12. Decisions asserted, not left open

- `/app` is `noindex`; `/` stays the canonical link to share.
- History caps at 25 entries.
- Opening any job page adds it to your history.
- No confirmation on remove. It is browser-local and cheap to redo.
- The landing keeps its hero exactly as it is. Its proportions are a later pass.
