# Thothly

> Compile ce que tu veux lire, peu importe d'où ça vient.

Thothly is a self-hostable open-source tool that compiles content from
multiple online sources (YouTube channels and playlists, blogs) into a
clean, well-formatted EPUB for offline reading on an e-reader.

Thothly is about **reading**, not querying. It is the complement of
tools like NotebookLM (which do RAG / Q&A over sources): Thothly
curates, formats, and ships a book — typography, table of contents,
chapter breaks — so the result feels like an Instapaper edition rather
than a text dump.

## Status

**V1 scaffolding.** This commit produces a working skeleton: a FastAPI
backend with a single `/health` endpoint, a Next.js home page that
fetches it server-side, and a `docker-compose` setup that wires the
two together. No ingestion, no EPUB generation, no LLM calls yet —
those land in subsequent tickets (see `thothly-v1-brief.md`).

## Prerequisites

- Docker Engine 24+
- Docker Compose v2 (bundled with recent Docker Desktop)

That is all. Everything else — Node, Python, `uv`, `pnpm`, Pandoc —
runs inside the containers.

## Quickstart

```bash
cp .env.example .env
docker compose up --build
```

Then open <http://localhost:3000>. You should see:

> **Thothly**
> Backend status: **ok** (v0.0.1)

If the backend is unreachable the page shows an explicit red error
with the URL it tried and the failure reason. That is the contract for
the scaffolding ticket.

## What is wired up

| Surface           | Endpoint / Page              | Behaviour                                                  |
| ----------------- | ---------------------------- | ---------------------------------------------------------- |
| Backend           | `GET /health`                | Returns `{"status":"ok","version":"0.0.1"}`                |
| Frontend home     | `/`                          | Server-side fetches `/health` and renders its status       |
| Docker network    | `backend` ↔ `frontend`       | Frontend reaches backend at `http://backend:8000` internally |
| Persistent volume | `./data` → `/data` (backend) | SQLite + generated EPUBs will live here in later tickets   |

## Why this architecture

The brief constrains every choice; the short version of the rationale:

- **Next.js (App Router) for the frontend.** Server Components let
  the home page fetch `/health` without leaking the backend URL to the
  browser, and shadcn/ui will give us the polished components we need
  once the submission UI lands. Tailwind v4 is what `create-next-app`
  ships today.

- **FastAPI + `uv` for the backend.** Python has the best ecosystem
  for the ingestion libraries the brief mandates (`yt-dlp`,
  `youtube-transcript-api`, `feedparser`, `trafilatura`, Pandoc via
  subprocess). `uv` replaces pip + venv + pip-tools with one fast
  tool, and produces a lockfile we copy straight into the Docker
  image for reproducible builds.

- **FastAPI `BackgroundTasks` + SQLite, no Redis, no Celery.** The
  brief explicitly rules out a queue. Compilation jobs are minutes
  long at most and a single backend process handles them fine. SQLite
  stores job state and lives in `./data` so it survives container
  restarts.

- **One container per service, networked by Compose.** The frontend
  talks to the backend over the internal Docker network
  (`http://backend:8000`); only ports `:3000` (UI) and `:8000`
  (backend, exposed for direct API exploration) are published to the
  host. No reverse proxy in V1 — a self-hoster on a VPS can add Caddy
  or Nginx in front later if they want HTTPS.

- **No auth, no accounts.** Single-user self-hosted tool. Auth is V2
  if Thothly ever turns into a SaaS.

## Project structure

```
thothly/
├── docker-compose.yml          # 2 services: backend, frontend
├── .env.example                # MISTRAL_API_KEY + overrides
├── README.md                   # this file
├── thothly-v1-brief.md         # full V1 brief + ticket roadmap
├── data/                       # persistent volume (SQLite, EPUBs)
├── frontend/                   # Next.js 16 + Tailwind v4 + shadcn/ui
│   ├── app/                    # App Router pages
│   ├── components/             # shadcn-installed primitives
│   ├── lib/                    # utility helpers
│   ├── Dockerfile              # multi-stage build (deps → build → runner)
│   └── package.json
├── backend/                    # FastAPI + uv
│   ├── app/
│   │   ├── api/                # HTTP routes (health.py for now)
│   │   ├── sources/            # ingestion per source type (later tickets)
│   │   ├── pipeline/           # transcript cleanup, normalisation
│   │   ├── render/             # Pandoc + EPUB CSS
│   │   ├── jobs/               # BackgroundTasks + SQLite state
│   │   └── core/               # config, version, logging
│   ├── tests/                  # pytest suite (added with first logic)
│   ├── pyproject.toml
│   └── Dockerfile
└── docs/
    ├── architecture.md         # populated as decisions land
    └── adr/                    # one ADR per non-trivial decision (from ticket #2 onwards)
```

## Working on Thothly without Docker

The Docker setup is the contract. For day-to-day iteration you can
also run each service directly:

```bash
# Backend
cd backend
uv sync
uv run uvicorn app.main:app --reload

# Frontend (in another terminal)
cd frontend
pnpm install
BACKEND_URL=http://localhost:8000 pnpm dev
```

## What's next

The next ticket (`POST /jobs`) introduces job state in SQLite and the
first source-agnostic endpoint. See `thothly-v1-brief.md` for the
full ordered ticket list.

## License

To be decided before public release.
