import logging
import subprocess
import tempfile
from pathlib import Path

from app.core.config import settings
from app.pipeline.models import CompiledBook

logger = logging.getLogger(__name__)

_CSS_PATH = Path(__file__).parent / "epub.css"


class RenderError(Exception):
    pass


def render_epub(book: CompiledBook, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    markdown_path = _write_temp(book.to_markdown(), suffix=".md")
    metadata_path = _write_temp(_metadata_yaml(book), suffix=".yaml")
    try:
        cmd = _build_command(markdown_path, output_path, metadata_path)
        logger.info("Running pandoc: %s", " ".join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            raise RenderError(
                f"Pandoc exited with code {result.returncode}: {result.stderr.strip()}"
            )
        if not output_path.exists():
            raise RenderError(f"Pandoc produced no output at {output_path}")

        logger.info("EPUB generated: %s", output_path)
        return output_path
    finally:
        markdown_path.unlink(missing_ok=True)
        metadata_path.unlink(missing_ok=True)


def _metadata_yaml(book: CompiledBook) -> str:
    return (
        f'title: "{book.title}"\n'
        'creator: "Thothly"\n'
        'lang: "fr"\n'
        f'date: "{book.generated_at.strftime("%Y-%m-%d")}"\n'
    )


def _build_command(
    input_path: Path, output_path: Path, metadata_path: Path
) -> list[str]:
    cmd = [
        settings.pandoc_binary,
        str(input_path),
        "-o",
        str(output_path),
        "--toc",
        "--toc-depth=3",
        "--epub-chapter-level=2",
        f"--metadata-file={metadata_path}",
    ]
    if _CSS_PATH.exists():
        cmd.append(f"--css={_CSS_PATH}")
    return cmd


def _write_temp(content: str, suffix: str) -> Path:
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=suffix, delete=False, encoding="utf-8"
    ) as tmp:
        tmp.write(content)
        return Path(tmp.name)
