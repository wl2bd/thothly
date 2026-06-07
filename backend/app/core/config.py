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


settings = Settings()
