import re
from bisect import bisect_right
from datetime import datetime, timezone

from markdownify import markdownify as md

from app.pipeline.models import CompiledBook, CompiledChapter
from app.sources.models import Transcript, TranscriptSegment


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


def _sentences_to_paragraphs(text: str, target_chars: int = 800) -> str:
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


def derive_book_title(source_names: list[str | None]) -> str:
    """A meaningful default book title from the source names.

    Uses the actual source name (playlist/channel/feed/site title) rather than
    a generic count, so the EPUB takes the real source name (e.g. a channel or
    blog title) instead of a generic "Thothly - 2 YouTube videos". The user can
    still override it before compiling.
    """
    names = [n.strip() for n in source_names if n and n.strip()]
    if not names:
        return "Thothly compilation"
    if len(names) == 1:
        return names[0]
    rest = len(names) - 1
    return f"{names[0]} (+{rest} more)"


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


# --- Pause + speaker-turn paragraphing (sentence-segmented audio) -------------
# Voxtral returns one sentence per segment with a timestamp (and, when diarized,
# a speaker), so we break paragraphs on real silences and speaker changes rather
# than a fixed character count. YouTube cues are NOT sentence-aligned, so they
# keep the sentence splitter above (breaking on a cue boundary would cut
# mid-sentence).
_PARA_PAUSE_S = 0.75         # a silence at least this long ends a paragraph
_PARA_SOFT_MAX_CHARS = 900   # ...and so does this much accumulated text
_PARA_MIN_CHARS = 200        # ...but not below this (except on a speaker change)

_SENTENCE_TAIL = (".", "!", "?", "…", '"', "”", ")")


def _looks_sentence_segmented(segments: list[TranscriptSegment]) -> bool:
    """True when most segments end on sentence punctuation — i.e. each segment is
    a whole sentence (Voxtral), so a segment boundary is a safe paragraph break.
    YouTube cues fail this, keeping them on the sentence splitter."""
    if len(segments) < 3:
        return False
    ends = sum(1 for s in segments if s.text.strip().endswith(_SENTENCE_TAIL))
    return ends / len(segments) >= 0.6


def _has_timing(segments: list[TranscriptSegment]) -> bool:
    return len(segments) >= 2 and any(s.duration_s > 0 for s in segments)


def _paragraphs_from_segments(
    segments: list[TranscriptSegment],
) -> list[tuple[str | None, str]]:
    """Group sentence-segments into (speaker, text) paragraphs, breaking on a
    speaker change, a real pause, or a soft length cap."""
    paragraphs: list[tuple[str | None, str]] = []
    current: list[str] = []
    current_speaker: str | None = None
    current_len = 0
    prev_end: float | None = None

    def flush() -> None:
        nonlocal current, current_len
        if current:
            paragraphs.append((current_speaker, " ".join(current)))
            current, current_len = [], 0

    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        gap = 0.0 if prev_end is None else max(0.0, seg.start_s - prev_end)
        if current:
            if seg.speaker != current_speaker:
                flush()
            elif (
                gap >= _PARA_PAUSE_S or current_len >= _PARA_SOFT_MAX_CHARS
            ) and current_len >= _PARA_MIN_CHARS:
                flush()
        if not current:
            current_speaker = seg.speaker
        current.append(text)
        current_len += len(text) + 1
        prev_end = seg.start_s + seg.duration_s

    flush()
    return paragraphs


def _generic_speaker_label(speaker: str | None) -> str:
    match = re.search(r"(\d+)$", speaker or "")
    return f"Speaker {match.group(1)}" if match else (speaker or "Speaker")


def segments_to_dialogue_markdown(
    segments: list[TranscriptSegment], speaker_names: dict[str, str] | None = None
) -> str:
    """Render diarized segments as dialogue: each speaker turn is prefixed with
    the speaker's mapped name (or a generic 'Speaker N'). A long turn splits into
    several paragraphs, only the first of which carries the label."""
    names = speaker_names or {}
    out: list[str] = []
    prev_speaker: str | None = None
    first = True
    for speaker, text in _paragraphs_from_segments(segments):
        if not text.strip():
            continue
        if speaker is not None and (first or speaker != prev_speaker):
            label = names.get(speaker) or _generic_speaker_label(speaker)
            out.append(f"**{label}:** {text}")
        else:
            out.append(text)
        prev_speaker = speaker
        first = False
    return "\n\n".join(out)


def segments_to_paragraph_markdown(segments: list[TranscriptSegment]) -> str:
    """Pause/length paragraphs for timed, sentence-segmented audio without
    speakers (a single-speaker podcast, or diarization off)."""
    return "\n\n".join(t for _, t in _paragraphs_from_segments(segments) if t.strip())


def transcript_to_markdown(
    transcript: Transcript, speaker_names: dict[str, str] | None = None
) -> str:
    """Render a transcript to Markdown.

    Diarized audio (segments carry a speaker) becomes dialogue; other
    sentence-segmented audio (Voxtral without diarization) becomes pause-based
    paragraphs. YouTube uses its chapters as sub-headings when present, and
    otherwise the sentence splitter — its cues aren't sentence-aligned, so we
    never break on a cue boundary.
    """
    segments = transcript.segments
    has_speakers = any(s.speaker for s in segments)

    if not transcript.chapters:
        if has_speakers:
            return segments_to_dialogue_markdown(segments, speaker_names)
        if _looks_sentence_segmented(segments) and _has_timing(segments):
            return segments_to_paragraph_markdown(segments)
        return segments_to_markdown([s.text for s in segments])

    starts = [c.start_s for c in transcript.chapters]
    buckets: list[list[TranscriptSegment]] = [[] for _ in transcript.chapters]
    for segment in segments:
        index = max(0, bisect_right(starts, segment.start_s) - 1)
        buckets[index].append(segment)

    sections: list[str] = []
    for chapter, segs in zip(transcript.chapters, buckets):
        if _looks_sentence_segmented(segs) and _has_timing(segs):
            body = segments_to_paragraph_markdown(segs)
        else:
            body = segments_to_markdown([s.text for s in segs])
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
