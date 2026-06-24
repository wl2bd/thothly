# Product

## Register

product

## Surface registers

Thothly is balanced. The app surfaces (search/stage, review → compile → download)
are **product** — design serves the task and stays calm. The landing sections
(hero, "How it works", "Yours, on your machine", FAQ) are treated as **brand** —
more expressive. Default register is `product`; override to `brand` when working
the landing. Both must still read as one Thothly.

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
  faux-aged paper, no relics. (Deliberate exception, 2026-06-24: hieroglyphs are
  allowed as ONE earned motif — the desert-gold glyph rain behind the hero,
  rendered flat, token-driven and reduced-motion-safe, never as papyrus / sepia /
  parchment chrome. Updated 2026-06-24: the rain runs in BOTH modes, tone
  inverted per ground — warm white-hot fading to desert gold on the night ground,
  a deep-gold lead fading up into the off-white on the light page — so light is a
  true peer of dark, not a costume. The glyphs stay flat gold on a chroma-0
  ground; deep gold is not sepia.) Otherwise the Thoth heritage is evoked through
  ink, type, grain and voice. Not a return to the previously-retired
  editorial/paper identity; character is carried by the token system.

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
5. **One Thothly, one system.** The expressive landing and the sober app are the
   same identity, carried by a single re-skinnable token layer.

## Accessibility & Inclusion

- Target **WCAG 2.1 AA**: body ≥ 4.5:1, large/bold ≥ 3:1, placeholders included;
  the grain/texture stays decorative and never lowers text contrast.
- **Light and dark** both first-class (set pre-paint to avoid flash).
- Any motion ships with a `prefers-reduced-motion` alternative.
- Keyboard-operable throughout; visible focus states.
- **English** is the default across UI, EPUB chrome and preface; ingested
  transcripts/articles stay faithful to their source language.
