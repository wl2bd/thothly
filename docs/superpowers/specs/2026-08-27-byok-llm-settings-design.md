# Bring your own LLM: design

> Status: design closed 2026-09-14. Everything under "Settled" is decided and
> needs no re-litigating. Next step is the implementation plan.

**Goal:** let someone using Thothly in a browser connect their own LLM (and
speech-to-text) subscription, so the AI path works without editing the backend
env. Today that path is operator-only: `LLM_BASE_URL` / `LLM_MODEL` /
`LLM_API_KEY` in `backend/.env`, read into a process-wide `settings` singleton
at boot. Nobody arriving on the public demo will ever do that.

## What the code says today

- The LLM layer is already provider-agnostic: one OpenAI-compatible
  `base_url` + `model` + optional key covers Ollama, Mistral, OpenAI,
  OpenRouter. So this is a form, not a per-vendor integration.
- `pipeline/llm.py` reads the global `settings` inside `_client()` and
  `llm_available()`. Readers of that global: `api/llm.py:46`,
  `jobs/preview.py:71`, `jobs/runner.py:80`, `pipeline/cleanup.py` (4 sites),
  `sources/podcast.py` (STT).
- Jobs run in-process via FastAPI `BackgroundTasks` with no persistence
  (`jobs/repository.py:101`, `main.py:20`): a restart already loses a running
  job.
- `pipeline/cleanup.py:323` and `sources/podcast.py:241` fan out over a
  `ThreadPoolExecutor`, so `complete()` and the STT calls run on worker
  threads.
- `RoleSelector` is only rendered when a model is configured
  (`app/jobs/[id]/page.tsx:1479`). With no key there is currently nothing on
  screen to click.

## Settled

1. **The key lives in the browser only.** `localStorage`, under a versioned
   key, the way `lib/history.ts` already stores compilations. It reaches the
   backend at two moments only: verification, and a job's `confirm`. It is
   never written server-side (no DB, no disk, no logs) and never echoed back
   by an API. The form shows `sk-...4f2c` and a replace control, never the
   stored value.
2. **Providers are allowlisted.** The backend accepts only known provider
   hosts; a free-form base URL is refused unless an env flag opens it, which
   is the self-hosted case. This closes the SSRF hole that BYOK would
   otherwise open on the public demo, where a stranger's URL would be fetched
   by the server. Ships with OpenAI, Mistral, OpenRouter, Groq, Together.
   One allowlist entry carries the host, the base URL and the provider's
   rates, and is therefore the single source for SSRF validation, the
   provider picker, and the cost estimate.
3. **Per-job credentials, threaded explicitly.** A new
   `app/jobs/credentials.py` holds an in-memory dict keyed by job id, filled
   at `confirm`, dropped when the job ends whatever the outcome. The runner
   reads it once and passes a frozen config object down as an explicit
   argument to `complete()` and the STT calls. An argument crosses a thread
   boundary safely, which a `ContextVar` does not:
   `ThreadPoolExecutor.submit` does not propagate context, so a context-based
   design would silently fall back to the server's global key inside the
   worker threads and bill the operator for a stranger's compilation. With
   nothing supplied, the global `settings` still applies, so a self-hoster
   sees no change.
4. **Model choice is a live list.** After the key verifies, the backend calls
   the provider's `GET /v1/models` and the dialog offers what that key
   actually grants, rather than asking the user to type a model string.
   Browsers cannot call these providers directly (no permissive CORS), so
   verification and listing both go through the backend, on the same
   allowlisted path.
5. **Verification happens at save, not at compile.** The dialog tests the key
   before closing. Discovering a bad key forty minutes into a compilation is
   the worst available outcome.
6. **A key that dies mid-compile does not kill the job.** The current
   `LLMError` fallback stands (the item compiles from raw text), and the
   per-item reporting shipped in August states the reason on each affected
   item, so an unpolished chapter is never silently returned.
7. **STT is in scope.** Same shape, same singleton problem, same dialog. The
   dialog carries a second block, folded away while no podcast is selected.
8. **The cost estimate follows the user's provider.** `Pricing` currently
   comes from server config (`api/llm.py`), which would quote the operator's
   rates to someone paying their own. Rates travel with the allowlist entry.
9. **Credentials ride in the `confirm` body**, not a header: headers reach
   proxy traces far more often than bodies do.
10. **`GET /llm` keeps its server-side meaning.** It gains the provider
    catalogue and rates; the frontend ORs `available` with what the browser
    holds.

11. **The AI polish panel always renders on the review screen.** With no key
    configured, a "Connect a model" action takes the place of the switch and
    opens the dialog; once a key verifies, the switch returns. The need is met
    exactly where it appears. Chosen 2026-09-14 over a header-only Settings
    link (nobody discovers the AI path) and a discreet line under the roles
    (easy to miss). The risk it carries is reading as a nag on the public
    demo, so the panel stays visually quiet: the free path remains the
    default, and nothing about it is gated or dimmed.
12. **A dialog and a `/settings` page, both.** The dialog is the in-flow
    entry; the page is where a model is changed, an expired key replaced, or
    a key erased from the browser, which the dialog alone cannot cover.

## Out of scope

No accounts, no cross-device sync, no server-side encryption (nothing is
stored to encrypt), and no local Ollama from the public demo: the server
cannot reach a visitor's localhost, and no arrangement changes that.

## Testing

Rules logic, so tests first: allowlist validation (including hosts that
resemble a provider without being one), the credential store's lifecycle
(put, read, dropped even when the job fails), and browser-over-env
precedence. The dialog and the panel are visual and get checked by running
the app.
