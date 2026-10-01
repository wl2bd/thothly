# Product

## Surfaces

Thothly is one workspace: the home page is the tool. Its surfaces (search and
stage, review, compile, the finished book) are **Operate**: design serves the
task and stays calm, and brand lives in precise details. The only expressive
moment is the home page at rest (the catchline, the sketch, the glow, the two
usage examples), which leans **Persuade**. About is plain **Read**. All of it
must read as one Thothly.

The mode itself is chosen per surface at work time and persisted in that surface's
brief, not here. This section only records which surface is which.

## Users

Privacy-minded, technically comfortable people who self-host (Docker, no accounts,
AGPL): tinkerers, indie hackers, researchers, lifelong learners. Two moments:
- **Composing** (in-app, focused): at their desk, gathering videos/podcasts/
  articles/playlists and deciding what makes the book.
- **Reading** (the payoff, away from the app): the finished compilation is read
  calmly on an e-reader, or handed to their own AI as Markdown.
The audience skews technical, but the deliverable is for any reader.

## Product Purpose

Turn scattered web content into one polished, faithful **compilation** you can
actually read: a clean EPUB for an e-reader, plus a Markdown twin for an AI.
Thothly is about reading, not querying — the complement to NotebookLM (RAG/Q&A).
Success: the result feels like a real edition (table of contents, chapters,
attribution, Instapaper-grade typography), the user trusts nothing was silently
rewritten, and the default path stays free.

## Brand Personality

**The modern scribe.** It carries the heritage of its name (Thoth — writing,
knowledge, the moon) as a precise modern tool, not a costume. Calm, knowing,
quietly reverent about reading; trustworthy and exact. A tactile signature (the
grain already in the wordmark) and an inky, faintly lunar feel give it warmth and
soul — never sterile.
- Three words: **scribal, faithful, calm.**
- Voice: spare and literary; no hype, no em-dashes; the deliverable is a
  "compilation" (EPUB and Markdown are just formats — don't brand around "EPUB").
- Emotional goal: calm focus, trust (faithful to my sources), quiet craft,
  ownership (it's mine, on my machine).

## Anti-references

- **Cold enterprise/corporate dashboard** (explicit): soulless gray, dense admin,
  no warmth. Thothly has a human, literary soul.
- **Generic interchangeable AI SaaS**: gradient hero, glassy cards, hero-metric
  grid, fluo accents.
- **Mythological costume**: papyrus, sepia, skeuomorphic old-book / parchment. No
  faux-aged paper, no relics, no hieroglyph motif (the glyph rain was retired on
  2026-09-29). The Thoth heritage is evoked through ink, type, grain and voice,
  and character is carried by the token system.

## Design Principles

1. **Faithful by default.** The product never silently rewrites a source; the UI
   must make that trustworthiness visible (review-before-compile, per-item
   preview, local-only). Practice the fidelity we promise.
2. **The tool is the scribe; the compilation is the hero.** The interface serves
   the act of binding sources into a book and gets out of the way — but as a
   characterful scribe, not a blank form.
3. **Character without costume.** Personality comes from earned craft (ink, type,
   grain, motion, voice), never from kitsch or decoration.
4. **Warm, never corporate.** If a screen could pass for an enterprise admin
   panel, it's wrong.
5. **One Thothly, one system.** The expressive home and the sober tool are the
   same identity, carried by a single token layer (see DESIGN.md).

## Accessibility & Inclusion

- Target **WCAG 2.1 AA**: body ≥ 4.5:1, large/bold ≥ 3:1, placeholders included;
  the grain/texture stays decorative and never lowers text contrast.
- **Light and dark** both first-class (set pre-paint to avoid flash).
- Any motion ships with a `prefers-reduced-motion` alternative.
- Keyboard-operable throughout; visible focus states.
- The interface is in **English**. The book (its chrome, preface and EPUB
  language) follows the language of its content, chapter by chapter; sources
  are never translated.
