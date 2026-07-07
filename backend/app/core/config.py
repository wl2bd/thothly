from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    data_dir: Path = Path("/data")
    pandoc_binary: str = "pandoc"
    scrape_timeout_s: int = 30
    max_items_per_source: int = 250
    # YouTube discovery probes each listed video's transcript to fill the review
    # screen (has subtitles? language? reading time?) — one live yt-dlp fetch per
    # video, run sequentially. A large playlist/channel would mean hundreds of
    # calls and a real risk of tripping YouTube's rate limit (HTTP 429) mid-run.
    # We list up to max_items_per_source but probe only the first N here; the
    # rest are listed with unknown transcript info (compile fetches them anyway).
    youtube_discovery_probe_limit: int = 50

    # ── Web article search ───────────────────────────────────────────────────
    # Which backend finds article URLs for a query. Pluggable so a self-hoster
    # can bring their own — see the README "Web search backends" table.
    #   marginalia — DEFAULT. Keyless, no signup. Indexes the independent "small
    #                web" (blogs, docs, long-form) and downranks SEO/commercial
    #                pages, which suits a reading compiler — and unlike scraping
    #                DuckDuckGo it isn't rate-limited to death after a couple of
    #                queries. Free keys carry a non-commercial data licence
    #                (CC-BY-NC-SA); a paid commercial key lifts that.
    #   brave      — General-web index, commercial-friendly, but needs an API key
    #                (card on file) and is metered. Set BRAVE_API_KEY + this.
    #   ddg        — Legacy DuckDuckGo HTML scrape. Rate-limited hard (works a
    #                couple of times, then returns nothing) — kept only as a
    #                last-resort fallback.
    web_search_backend: str = "marginalia"

    # Marginalia: the "public" key works with no signup but shares one tight rate
    # limit across every caller — request a free personal key (email
    # contact@marginalia-search.com) for headroom, or a commercial key to drop
    # the non-commercial restriction. https://about.marginalia-search.com/article/api/
    marginalia_api_key: str = "public"
    marginalia_base_url: str = "https://api.marginalia.nu"

    # Brave Search API. Unset unless web_search_backend="brave" (the service
    # falls back to Marginalia when brave is selected without a key).
    brave_api_key: str | None = None
    brave_base_url: str = "https://api.search.brave.com/res/v1/web/search"

    # Preferred content language(s), highest priority first. Drives YouTube
    # metadata localization (title, chapters) and is a hint for transcript track
    # choice — though the track picker always prefers the video's ORIGINAL track
    # over a translation, so the body stays faithful to the source language
    # regardless. English-first keeps metadata in English (the app default)
    # instead of pulling a French localization for an English video; YouTube
    # falls back to the original when no English localization exists. Multilingual
    # is deferred — set this to your content's language if it isn't English.
    preferred_languages: list[str] = ["en"]

    # Optional LLM layer (transcript cleanup / multi-role passes). Left empty by
    # default — Thothly stays zero-LLM. One OpenAI-compatible endpoint covers
    # Ollama (local, no key), Mistral, OpenAI, OpenRouter, etc.: set base_url +
    # model (+ api_key when the provider requires one).
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_timeout_s: int = 60
    llm_chunk_words: int = 1200  # words per LLM call — small enough to verify & not truncate
    llm_max_concurrency: int = 4  # chunks cleaned in parallel (big win on hosted APIs)

    # Optional speech-to-text layer (podcast episodes -> transcript). Same
    # OpenAI-compatible shape as the LLM layer above: point base_url + model at
    # Mistral's Voxtral (audio/transcriptions), a local vLLM/whisper.cpp server
    # (no key), or OpenAI. Unset -> podcast episodes are skipped, exactly like a
    # YouTube video with no subtitles. Mistral default model: voxtral-mini-latest.
    stt_base_url: str | None = None
    stt_api_key: str | None = None
    stt_model: str | None = None
    stt_timeout_s: int = 600  # a single request can be a whole ~1 h episode
    # Hard cap on a downloaded episode (MB). Audio is streamed to disk, so this
    # stops a runaway or malicious enclosure from filling the disk; a larger
    # episode is skipped rather than downloaded.
    stt_max_download_mb: int = 500
    # Speaker diarization: ask the provider to label who is speaking (Mistral
    # Voxtral). Requested via the transcription call; a provider that doesn't
    # support it (whisper.cpp, OpenAI) falls back to a plain transcription, so
    # this is safe to leave on. Off → never request it.
    stt_diarize: bool = True
    # Per-request audio length cap. The whole episode goes in a single request
    # when it fits under this — diarization speaker ids are only consistent
    # within one request, so we avoid chunking when we can. Mistral's general
    # transcription limit is 60 min; we stay just under it and only split
    # longer episodes (each chunk then diarized independently). Needs ffmpeg.
    stt_max_chunk_minutes: int = 55
    stt_max_concurrency: int = 4  # chunks transcribed in parallel
    # Podcasts render as diarized dialogue with speaker labels. On (and an LLM
    # configured) → a cheap LLM pass maps the speaker ids to real names when it
    # can infer them from the dialogue (introductions, "welcome X…"), falling
    # back to a role (Host, Guest) or "Speaker N" per speaker. This only renames
    # the labels — it never re-edits the (already clean) Voxtral text. Off, or no
    # LLM → plain "Speaker N" titles.
    podcast_speaker_naming: bool = True

    # Approximate provider pricing (USD), used ONLY to show a pre-compile cost
    # estimate in the review screen — we never bill anything. Defaults track
    # Mistral (Voxtral $0.003/min; Mistral Small ~$0.20/$0.60 per 1M tokens).
    # Override to match your provider so the estimate stays meaningful.
    stt_price_per_minute: float = 0.003
    llm_price_per_mtok_in: float = 0.20
    llm_price_per_mtok_out: float = 0.60



settings = Settings()
