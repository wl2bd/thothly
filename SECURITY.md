# Security Policy

## Supported versions

Thothly is pre-1.0 and moves fast. Security fixes land on `main` and in the
latest tagged release only. If you run an older tag, upgrade before reporting.

| Version | Supported |
| --- | --- |
| `main` / latest release | ✅ |
| older tags | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub's **[Private vulnerability reporting](https://github.com/wl2bd/thothly/security/advisories/new)**
(Security → Report a vulnerability). If you cannot use GitHub, email
**wael.bouabda@proton.me** with `SECURITY` in the subject.

Please include: affected component (search, discovery, compile, render), the
source type involved (YouTube / blog / podcast), whether an LLM/STT endpoint was
configured, and a minimal reproduction. We aim to acknowledge within a few days.

## Threat model — read before deploying

Thothly is a **single-user, self-hosted tool with no authentication**. This is by
design, not an oversight, and it shapes what "secure" means here:

- **Do not expose it to the public internet as-is.** There are no accounts, no
  login, and no rate limiting on the API. Anyone who can reach the port can start
  jobs, list every compilation, and download the output. The bundled
  `docker-compose.yml` therefore binds both services to `127.0.0.1` by default.
  For remote access, put an authenticating reverse proxy (Caddy, Nginx, a VPN,
  Tailscale, …) in front — never publish `:8000`/`:3000` directly.
- **It fetches arbitrary user-supplied URLs.** Discovery and compilation retrieve
  YouTube pages, RSS feeds, blog homepages, podcast audio, and images referenced
  by scraped pages. Only run it on hosts where reaching internal/link-local
  addresses (e.g. cloud metadata endpoints) is not a concern, or keep it behind
  the localhost default above.
- **Your API keys live in `.env`.** `LLM_*` / `STT_*` credentials are read from a
  local, git-ignored `.env`. Keep that file private; never commit it.

If you operate Thothly in a way that widens this model (multi-user, public
exposure, untrusted input at scale), that hardening is your responsibility — the
project does not ship it.
