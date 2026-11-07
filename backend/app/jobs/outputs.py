"""Where a finished compilation's files live, and how each is served."""

from pathlib import Path
from typing import Literal

from app.core.config import settings

OutputFormat = Literal["epub", "md"]

# Label, as the visitor reads it, and media type.
FORMATS: dict[OutputFormat, tuple[str, str]] = {
    "epub": ("EPUB", "application/epub+zip"),
    # The same content as plain Markdown, for feeding to an AI or any text tool.
    "md": ("Markdown", "text/markdown"),
}


def output_file(job_id: str, fmt: OutputFormat) -> Path:
    return settings.data_dir / "output" / f"{job_id}.{fmt}"
