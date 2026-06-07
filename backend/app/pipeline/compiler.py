import re
from bisect import bisect_right
from datetime import datetime, timezone

from markdownify import markdownify as md

from app.pipeline.models import CompiledBook, CompiledChapter
from app.sources.models import Transcript


class CompilationError(Exception):
    pass


# Split on sentence-ending punctuation followed by whitespace. Keeps the
# terminator attached to the sentence it ends.
_SENTENCE_END = re.compile(r"(?<=[.!?…])\s+")


def is_punctuated(text: str) -> bool:
    """Heuristic: does this text carry real sentence punctuation?

    YouTube auto-captions are inconsistent — newer ASR adds punctuation, older
    tracks have none at all. We only get clean sentence-based paragraphs when
    the source is actually punctuated, so we detect that with a density check
    (roughly one sentence-ending mark per 50 words). A stray mark or two in an
    otherwise raw transcript stays below the threshold.
    """
    words = len(text.split())
    if words < 20:
        return False
    marks = sum(text.count(c) for c in ".!?")
    return marks / words >= 0.02


def _sentences_to_paragraphs(text: str, target_chars: int = 450) -> str:
    """Group sentences into evenly sized paragraphs at real sentence breaks."""
    sentences = [s.strip() for s in _SENTENCE_END.split(text.strip()) if s.strip()]
    paragraphs: list[str] = []
    current: list[str] = []
    current_len = 0
    for sentence in sentences:
        current.append(sentence)
        current_len += len(sentence)
        if current_len >= target_chars:
            paragraphs.append(" ".join(current))
            current, current_len = [], 0
    if current:
        paragraphs.append(" ".join(current))
    return "\n\n".join(paragraphs)


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


_ATX_HEADING = re.compile(r"^(#{1,6})(\s.*)$")


def _normalize_title(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def strip_leading_title(markdown: str, title: str) -> str:
    """Drop a leading heading that merely repeats the chapter title.

    Article extractors (trafilatura) keep the article's own <h1> title at the
    top of the extracted content. Since we already emit that title as the
    chapter heading, it shows up twice in a row — and worse, it makes the real
    sections one level deeper, pushing them out of the table of contents.
    Remove the first heading when it matches the title.
    """
    lines = markdown.split("\n")
    for i, line in enumerate(lines):
        match = _ATX_HEADING.match(line)
        if not match:
            continue
        heading = _normalize_title(match.group(2))
        wanted = _normalize_title(title)
        if heading == wanted or heading.startswith(wanted) or wanted.startswith(heading):
            del lines[i]
            if i < len(lines) and not lines[i].strip():
                del lines[i]
        break  # only the first heading can be the duplicated title
    return "\n".join(lines).lstrip("\n")


def demote_headings(markdown: str, floor: int = 2) -> str:
    """Shift a chapter body's headings so they nest under its title.

    Scraped articles keep their own headings; left as-is they can sit at or
    above the chapter title (an h1 in the book), flattening the table of
    contents. We shift every heading down so the shallowest becomes `floor`
    (h2 by default, i.e. just under the chapter), preserving the article's own
    relative structure. Code fences are left untouched so '#' comments aren't
    mistaken for headings.
    """
    lines = markdown.split("\n")
    levels = [len(m.group(1)) for _, m in _heading_lines(lines) if m]
    if not levels:
        return markdown
    shift = floor - min(levels)
    if shift <= 0:
        return markdown

    out: list[str] = []
    for line, in_code in _with_fence_state(lines):
        match = None if in_code else _ATX_HEADING.match(line)
        if match:
            level = min(6, len(match.group(1)) + shift)
            line = "#" * level + match.group(2)
        out.append(line)
    return "\n".join(out)


def _with_fence_state(lines: list[str]):
    """Yield (line, inside_code_fence) for each line."""
    in_fence = False
    for line in lines:
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            yield line, in_fence  # the fence line itself isn't a heading
            continue
        yield line, in_fence


def _heading_lines(lines: list[str]):
    """Yield (line, match) for heading lines outside code fences."""
    for line, in_code in _with_fence_state(lines):
        if not in_code:
            yield line, _ATX_HEADING.match(line)


def segments_to_markdown(segment_texts: list[str], group_size: int = 8) -> str:
    """Turn subtitle segments into readable paragraphs, adaptively.

    If the captions are punctuated (newer YouTube ASR), we split on real
    sentence boundaries and group those into evenly sized paragraphs — clean,
    zero-LLM. If they're raw (no punctuation), there are no sentences to split
    on, so we fall back to grouping consecutive segments; that case is the one
    an LLM cleanup pass is meant to handle later.
    """
    cleaned = [t.strip() for t in segment_texts if t and t.strip()]
    if not cleaned:
        return ""

    full_text = " ".join(cleaned)
    if is_punctuated(full_text):
        return _sentences_to_paragraphs(full_text)

    paragraphs = [
        " ".join(cleaned[i : i + group_size])
        for i in range(0, len(cleaned), group_size)
    ]
    return "\n\n".join(paragraphs)


def transcript_to_markdown(transcript: Transcript) -> str:
    """Render a transcript, using YouTube chapters as sub-headings when present.

    Chapters give readable structure independent of punctuation: each section
    becomes an H2 heading (under the video's H1 title) with its own paragraphs.
    Each segment is assigned to the last chapter that started at or before it
    (so nothing is dropped at the boundaries). Without chapters we fall back to
    flat paragraphs.
    """
    if not transcript.chapters:
        return segments_to_markdown([s.text for s in transcript.segments])

    starts = [c.start_s for c in transcript.chapters]
    buckets: list[list[str]] = [[] for _ in transcript.chapters]
    for segment in transcript.segments:
        index = max(0, bisect_right(starts, segment.start_s) - 1)
        buckets[index].append(segment.text)

    sections: list[str] = []
    for chapter, texts in zip(transcript.chapters, buckets):
        body = segments_to_markdown(texts)
        if body:
            sections.append(f"## {chapter.title}\n\n{body}")
    return "\n\n".join(sections)


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
