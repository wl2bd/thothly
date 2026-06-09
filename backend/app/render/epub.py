import json
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.core.config import settings
from app.pipeline.models import CompiledBook
from app.render.images import localize_images

logger = logging.getLogger(__name__)

_CSS_PATH = Path(__file__).parent / "epub.css"


class RenderError(Exception):
    pass


def render_epub(book: CompiledBook, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Remote images are downloaded and embedded so the EPUB is self-contained;
    # the media dir holds those files on disk while Pandoc packages them.
    media_dir = Path(tempfile.mkdtemp(prefix="thothly-media-"))
    markdown = localize_images(book.to_markdown(), media_dir, settings.scrape_timeout_s)

    markdown_path = _write_temp(markdown, suffix=".md")
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
        shutil.rmtree(media_dir, ignore_errors=True)


def _metadata_yaml(book: CompiledBook) -> str:
    # dc:creator should name the people who wrote the sources, not the tool.
    # Collect the chapters' authors (de-duplicated, order preserved); fall back
    # to "Thothly" only when no source carries an author. json.dumps quotes and
    # escapes each value safely for YAML.
    seen: dict[str, None] = {}
    for chapter in book.chapters:
        if chapter.author and chapter.author.strip():
            seen.setdefault(chapter.author.strip(), None)
    authors = list(seen) or ["Thothly"]

    lines = [f"title: {json.dumps(book.title)}", "author:"]
    lines += [f"  - {json.dumps(name)}" for name in authors]
    lines += [
        'lang: "fr"',
        'toc-title: "Table des matières"',
        f'date: "{book.generated_at.strftime("%Y-%m-%d")}"',
    ]
    return "\n".join(lines) + "\n"


def _build_command(
    input_path: Path, output_path: Path, metadata_path: Path
) -> list[str]:
    cmd = [
        settings.pandoc_binary,
        str(input_path),
        "-o",
        str(output_path),
        "--toc",
        "--toc-depth=2",
        "--split-level=1",
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
