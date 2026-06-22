# Thothly

> Compile whatever you want to read, no matter where it comes from.

Thothly is a self-hostable, open-source tool that compiles content from across
the web — YouTube videos, playlists and channels, blogs, and podcasts — into a
single clean, well-formatted EPUB for offline reading on an e-reader.

Thothly is about **reading**, not querying. It is the complement of tools like
NotebookLM (which do RAG / Q&A over sources): Thothly curates, formats, and
ships a book — typography, table of contents, chapter breaks, source
attribution — so the result feels like an Instapaper edition rather than a text
dump. Every compilation also yields a plain-Markdown twin, so the same reading
list can be handed straight to an AI.

## Features

- **Search or paste.** Type a query to search YouTube, podcasts, and the web at
  once (all keyless), or paste a link directly — single videos, playlists,
  channels, blog homepages, or RSS feeds. The source type is auto-detected; no
  dropdowns. Filter results by provider and sort them by relevance, duration, or
  title.
- **Review before you compile.** Discovery lists every item with its reading
  time, language, and transcript readiness, and a no-LLM content preview of
  exactly what each item would contribute. You tick what makes the book.
- **Clean EPUB output.** Sources index, per-chapter attribution, YouTube
  chapters as sub-headings, an editorial cover, and Instapaper-grade typography.
- **Markdown companion.** Every compilation also produces a standalone Markdown
  file of the same content — perfect for feeding the reading list to an AI or
  any plain-text tool.
- **Zero-LLM by default.** Native subtitles and article text, never rewritten.
- **Optional LLM cleanup.** Re-punctuate raw captions, copyedit, infer section
  headings, or generate a preface — entirely opt-in (see below).
- **Optional podcast transcription.** Turn audio episodes into chapters via any
  OpenAI-compatible speech-to-text endpoint, with diarized speaker labels.
- **Self-hosted, single-user.** No accounts, no telemetry, runs on your machine.

## How it works

```
search / paste links → discovery → review → compile → download (EPUB + Markdown)
```

You stage one or more sources, from search results or pasted URLs, and start a
job (`POST /jobs`). Discovery enumerates the items (cheap, in the background)
and the job moves to `reviewing`. You pick the items, an optional title, and any
LLM cleanup roles (`POST /jobs/{id}/confirm`); compilation fetches the selected
content, renders a single EPUB with Pandoc plus its Markdown twin, and the job
reaches `completed`. Then you download it (`GET /jobs/{id}/download`, or
`?format=md` for the Markdown). Job state lives in SQLite — no Redis, no Celery.

## Prerequisites

- Docker Engine 24+
- Docker Compose v2 (bundled with recent Docker Desktop)

That is all. Everything else — Node, Python, `uv`, `pnpm`, Pandoc — runs inside
the containers.

## Quickstart

```bash
cp .env.example .env
docker compose up --build
```

Open <http://localhost:3000>, search for something (or paste a YouTube/blog
link), and follow discovery → review → compile. The backend API is published on
`:8000` (interactive docs at <http://localhost:8000/docs>) for direct
exploration. Generated files and the SQLite database persist in `./data`.

## Optional LLM cleanup

By default Thothly is **zero-LLM**: punctuated captions are split into clean
paragraphs for free, and raw (unpunctuated) captions fall back to a simple
grouping. You can optionally enable an LLM layer that, at compile time and only
on the items you selected, runs the roles you tick in the review screen:

- **Punctuation** — restores punctuation and paragraphs to raw transcripts.
- **Copyedit** — removes filler words and obvious speech-recognition mistakes.
- **Sections** — infers section headings for content without chapters.
- **Preface** — generates a short opening preface for the book.

One OpenAI-compatible endpoint covers every provider — point `LLM_BASE_URL`,
`LLM_MODEL` (and `LLM_API_KEY` when required) at Ollama (local, free), Mistral,
OpenAI, OpenRouter, etc. See `.env.example`. Each pass is **verified**: the
output is compared to the source and a drift (paraphrase, truncation,
hallucination) is rejected in favour of the original text, so the LLM can never
silently rewrite your book. Results are cached per (content, role-set, model),
so re-compiling is free, and any failure falls back to the zero-LLM path — it
never breaks a compile. Leave the variables empty to keep Thothly fully free.

## Optional podcast transcription

Search also covers **podcasts** (Apple's keyless iTunes index). A picked
episode is audio, so turning it into a chapter needs a speech-to-text endpoint —
the only outbound dependency beyond the keyless scrapers. Point `STT_BASE_URL`,
`STT_MODEL` (and `STT_API_KEY` when required) at any OpenAI-compatible
`audio/transcriptions` endpoint: **Mistral Voxtral** (`voxtral-mini-latest`), a
local vLLM/whisper.cpp server (no key), or OpenAI. See `.env.example`.

Transcription runs lazily — only for the episodes you select — and is cached by
audio URL, so re-compiling never re-pays for it. Episodes keep their diarized
dialogue with per-speaker labels; when an LLM is configured, real speaker names
are resolved by default (`PODCAST_SPEAKER_NAMING`) — disable it for plain
"Speaker N" labels. Long episodes are split into ≤25-min chunks, which needs
`ffmpeg` installed (short ones transcribe without it). Leave the variables empty
and episodes are simply skipped; many podcasts are also on YouTube, where native
subtitles already cover them for free.

## Configuration

All settings have sensible defaults; see `.env.example` for the full list.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATA_DIR` | `/data` | SQLite DB + generated files (mounted from `./data` in Compose) |
| `BACKEND_URL` | `http://backend:8000` | Frontend → backend (set by Compose; override only outside it) |
| `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` | empty | Optional LLM endpoint (see above) |
| `STT_BASE_URL` / `STT_MODEL` / `STT_API_KEY` | empty | Optional speech-to-text endpoint for podcast episodes (see above) |
| `PODCAST_SPEAKER_NAMING` | `true` | Resolve real speaker names via the LLM (otherwise plain "Speaker N") |

## Running without Docker

The Docker setup is the contract. For day-to-day iteration you can also run each
service directly:

```bash
# Backend
cd backend
uv sync
uv run uvicorn app.main:app --reload

# Frontend (in another terminal)
cd frontend
pnpm install
BACKEND_URL=http://127.0.0.1:8000 pnpm dev
```

The Markdown companion is free, but the EPUB step shells out to **Pandoc**, so
install it locally if you compile outside Docker.

## Architecture

- **Next.js (App Router) for the frontend.** Server Components and small route
  handlers proxy to the backend so its URL never leaks to the browser. UI is
  built with Tailwind v4 and shadcn/base-ui primitives.
- **FastAPI + `uv` for the backend.** Python has the best ecosystem for the
  ingestion libraries (`yt-dlp` for subtitles, `feedparser`, `trafilatura`,
  Pandoc via subprocess). `uv` produces a lockfile copied straight into the
  Docker image for reproducible builds.
- **`BackgroundTasks` + SQLite, no queue.** Compilation jobs are minutes long at
  most and a single backend process handles them fine; SQLite stores job state
  and the transcript/LLM caches under `./data` so they survive restarts.
- **One container per service, networked by Compose.** Only `:3000` (UI) and
  `:8000` (API) are published. No reverse proxy — add Caddy or Nginx in front if
  you want HTTPS.
- **No auth, no accounts.** Single-user self-hosted tool.

## Project structure

```
thothly/
├── docker-compose.yml          # 2 services: backend, frontend
├── .env.example                # DATA_DIR / BACKEND_URL / optional LLM_* / STT_* keys
├── data/                       # persistent volume (SQLite DB, generated files)
├── frontend/                   # Next.js 16 + Tailwind v4 + shadcn/base-ui
│   ├── app/                    # App Router pages + /api proxy routes
│   ├── components/ui/          # shadcn primitives
│   └── lib/                    # api client + backend proxy helpers
├── backend/                    # FastAPI + uv
│   ├── app/
│   │   ├── api/                # health, llm catalogue
│   │   ├── search/             # multi-provider search (youtube, podcast, web)
│   │   ├── sources/            # ingestion: youtube, blog, podcast, discovery, caches
│   │   ├── pipeline/           # compiler, LLM cleanup (llm/roles/cleanup)
│   │   ├── render/             # Pandoc + EPUB CSS + cover
│   │   ├── jobs/               # routes, BackgroundTasks phases, SQLite state
│   │   └── core/               # config, database, version
│   └── tests/                  # pytest suite
└── docs/adr/                   # architecture decision records
```

## Limitations

- **YouTube rate-limiting.** Transcript fetches go through a real YouTube client
  (`yt-dlp`), but YouTube aggressively rate-limits (HTTP 429) requests from
  data-center IPs. It works fine from a residential IP; a hosted deployment
  needs a residential proxy to fetch transcripts reliably.
- **Single-user, no auth.** Don't expose it to the public internet as-is.

## License

[GNU AGPL-3.0](LICENSE). If you run a modified version as a network service, you
must make your source available to its users.
