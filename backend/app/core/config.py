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

    # Preferred content languages, highest priority first. Drives both the
    # YouTube metadata localization (so titles come back in the original
    # language, not the viewer's UI language) and the transcript track choice.
    preferred_languages: list[str] = ["fr", "en"]

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
    # Podcasts render as diarized dialogue with speaker labels. Off → simple
    # "Speaker N" titles (the Voxtral transcript is already clean, so no LLM is
    # needed just to know who speaks). On → an LLM pass maps the ids to real
    # names/roles (Host, Guest, …) when they can be inferred from the dialogue.
    podcast_speaker_naming: bool = False

    # Approximate provider pricing (USD), used ONLY to show a pre-compile cost
    # estimate in the review screen — we never bill anything. Defaults track
    # Mistral (Voxtral $0.003/min; Mistral Small ~$0.20/$0.60 per 1M tokens).
    # Override to match your provider so the estimate stays meaningful.
    stt_price_per_minute: float = 0.003
    llm_price_per_mtok_in: float = 0.20
    llm_price_per_mtok_out: float = 0.60



settings = Settings()
