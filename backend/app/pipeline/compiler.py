from datetime import datetime, timezone

from markdownify import markdownify as md

from app.pipeline.models import CompiledBook, CompiledChapter


class CompilationError(Exception):
    pass


def derive_book_title(source_labels: list[str]) -> str:
    if not source_labels:
        return "Thothly Compilation"
    if len(source_labels) == 1:
        return f"Thothly — {source_labels[0]}"
    rest = len(source_labels) - 1
    suffix = "s" if rest > 1 else ""
    return f"Thothly — {source_labels[0]} (+{rest} other{suffix})"


def html_to_markdown(html: str) -> str:
    if not html or not html.strip():
        return ""
    return md(html, heading_style="ATX", bullets="-").strip()


def segments_to_markdown(segment_texts: list[str], group_size: int = 8) -> str:
    """Turn raw subtitle segments into readable paragraphs.

    Native YouTube captions have no punctuation or paragraph breaks. With a
    zero-LLM policy we don't rewrite them — we only group consecutive segments
    into paragraphs so the EPUB isn't a single wall of text.
    """
    cleaned = [t.strip() for t in segment_texts if t and t.strip()]
    if not cleaned:
        return ""

    paragraphs = [
        " ".join(cleaned[i : i + group_size])
        for i in range(0, len(cleaned), group_size)
    ]
    return "\n\n".join(paragraphs)


def compile_book(chapters: list[CompiledChapter], title: str) -> CompiledBook:
    usable = [c for c in chapters if c.content_md and c.content_md.strip()]
    if not usable:
        raise CompilationError(
            "No content could be compiled from the selected items. Check that the "
            "YouTube videos have native subtitles and that the articles have "
            "extractable content."
        )

    return CompiledBook(
        title=title,
        generated_at=datetime.now(timezone.utc),
        chapters=usable,
    )
