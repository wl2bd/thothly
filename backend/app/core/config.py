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


settings = Settings()
