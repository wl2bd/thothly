import json
import logging
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from app.core.config import settings
from app.pipeline.models import CompiledBook
from app.render.cover import generate_cover
from app.render.images import localize_images

logger = logging.getLogger(__name__)

_CSS_PATH = Path(__file__).parent / "epub.css"


class RenderError(Exception):
    pass


def render_epub(book: CompiledBook, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Remote images are downloaded and embedded so the EPUB is self-contained;
    # the media dir holds those files (and the generated cover) on disk while
    # Pandoc packages them.
    media_dir = Path(tempfile.mkdtemp(prefix="thothly-media-"))
    markdown = localize_images(book.to_markdown(), media_dir, settings.scrape_timeout_s)

    cover_path = _make_cover(book, media_dir)
    markdown_path = _write_temp(markdown, suffix=".md")
    metadata_path = _write_temp(_metadata_yaml(book), suffix=".yaml")
    try:
        cmd = _build_command(markdown_path, output_path, metadata_path, cover_path)
        logger.info("Running pandoc: %s", " ".join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            raise RenderError(
                f"Pandoc exited with code {result.returncode}: {result.stderr.strip()}"
            )
        if not output_path.exists():
            raise RenderError(f"Pandoc produced no output at {output_path}")

        _add_bodymatter_landmark(output_path)
        logger.info("EPUB generated: %s", output_path)
        return output_path
    finally:
        markdown_path.unlink(missing_ok=True)
        metadata_path.unlink(missing_ok=True)
        shutil.rmtree(media_dir, ignore_errors=True)


def _chapter_authors(book: CompiledBook) -> list[str]:
    """Unique source authors, order preserved (empty list if none carry one)."""
    seen: dict[str, None] = {}
    for chapter in book.chapters:
        if chapter.author and chapter.author.strip():
            seen.setdefault(chapter.author.strip(), None)
    return list(seen)


def _make_cover(book: CompiledBook, media_dir: Path) -> Path | None:
    """Render the editorial cover; None (no cover) if generation fails."""
    try:
        return generate_cover(book.title, _chapter_authors(book), media_dir / "cover.png")
    except Exception as exc:  # never let a cover problem block the EPUB
        logger.warning("Cover generation failed; rendering without a cover: %s", exc)
        return None


def _metadata_yaml(book: CompiledBook) -> str:
    # dc:creator should name the people who wrote the sources, not the tool.
    # json.dumps quotes and escapes each value safely for YAML; fall back to
    # "Thothly" only when no source carries an author.
    authors = _chapter_authors(book) or ["Thothly"]

    lines = [f"title: {json.dumps(book.title)}", "author:"]
    lines += [f"  - {json.dumps(name)}" for name in authors]
    lines += [
        'lang: "fr"',
        'toc-title: "Table des matières"',
        f'date: "{book.generated_at.strftime("%Y-%m-%d")}"',
    ]
    return "\n".join(lines) + "\n"


def _build_command(
    input_path: Path,
    output_path: Path,
    metadata_path: Path,
    cover_path: Path | None = None,
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
    if cover_path is not None and cover_path.exists():
        cmd.append(f"--epub-cover-image={cover_path}")
    if _CSS_PATH.exists():
        cmd.append(f"--css={_CSS_PATH}")
    return cmd


def _add_bodymatter_landmark(epub_path: Path) -> None:
    """Add a "start of text" (bodymatter) landmark to nav.xhtml.

    Pandoc only emits titlepage + toc landmarks and offers no flag for the
    start-of-reading landmark, so we add one ourselves, pointing at the first
    content location (the first TOC link). Best-effort: any failure leaves the
    valid EPUB pandoc already produced untouched.
    """
    try:
        with zipfile.ZipFile(epub_path) as archive:
            names = archive.namelist()
            nav_name = next((n for n in names if n.endswith("nav.xhtml")), None)
            if nav_name is None:
                return
            nav = archive.read(nav_name).decode("utf-8")
            entries = [(n, archive.read(n)) for n in names]

        patched = _inject_bodymatter(nav)
        if patched == nav:
            return  # nothing to add (already present, or structure unexpected)

        tmp = epub_path.with_suffix(".tmp.epub")
        with zipfile.ZipFile(tmp, "w") as out:
            # OCF requires "mimetype" to be the first entry and uncompressed.
            for name, data in entries:
                if name == "mimetype":
                    out.writestr(
                        zipfile.ZipInfo("mimetype"), data, compress_type=zipfile.ZIP_STORED
                    )
            for name, data in entries:
                if name == "mimetype":
                    continue
                content = patched.encode("utf-8") if name == nav_name else data
                out.writestr(name, content, compress_type=zipfile.ZIP_DEFLATED)
        tmp.replace(epub_path)
    except (OSError, zipfile.BadZipFile) as exc:
        logger.warning("Could not add bodymatter landmark: %s", exc)


def _inject_bodymatter(nav: str) -> str:
    toc = re.search(r'epub:type="toc".*?</nav>', nav, re.DOTALL)
    if not toc:
        return nav
    first_link = re.search(r'href="([^"]+)"', toc.group(0))
    landmarks = re.search(
        r'(<nav epub:type="landmarks".*?<ol>)(.*?)(\s*</ol>)', nav, re.DOTALL
    )
    if not first_link or not landmarks or 'epub:type="bodymatter"' in landmarks.group(0):
        return nav

    item = (
        f'\n    <li>\n      <a href="{first_link.group(1)}" '
        'epub:type="bodymatter">Début du texte</a>\n    </li>'
    )
    block = landmarks.group(1) + landmarks.group(2) + item + landmarks.group(3)
    return nav[: landmarks.start()] + block + nav[landmarks.end() :]


def _write_temp(content: str, suffix: str) -> Path:
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=suffix, delete=False, encoding="utf-8"
    ) as tmp:
        tmp.write(content)
        return Path(tmp.name)
