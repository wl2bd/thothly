"""A transcript as chapter Markdown, with no AI: paragraphs, speakers, chapters."""

import re
from bisect import bisect_right

from app.pipeline.models import escape_tags
from app.sources.models import Chapter, Transcript, TranscriptSegment, is_punctuated

# Split on sentence-ending punctuation followed by whitespace. Keeps the
# terminator attached to the sentence it ends.
_SENTENCE_END = re.compile(r"(?<=[.!?…])\s+")


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


def _generic_speaker_label(speaker: str | None, word: str = "Speaker") -> str:
    match = re.search(r"(\d+)$", speaker or "")
    return f"{word} {match.group(1)}" if match else (speaker or word)


def segments_to_dialogue_markdown(
    segments: list[TranscriptSegment],
    speaker_names: dict[str, str] | None = None,
    speaker_word: str = "Speaker",
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
            label = names.get(speaker) or _generic_speaker_label(speaker, speaker_word)
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


def chapter_buckets(transcript: Transcript) -> list[tuple[Chapter, list[TranscriptSegment]]]:
    """Each video chapter with its segments: a segment belongs to the last
    chapter that started at or before it."""
    starts = [c.start_s for c in transcript.chapters]
    buckets: list[list[TranscriptSegment]] = [[] for _ in transcript.chapters]
    for segment in transcript.segments:
        buckets[max(0, bisect_right(starts, segment.start_s) - 1)].append(segment)
    return list(zip(transcript.chapters, buckets))


def transcript_to_markdown(
    transcript: Transcript,
    speaker_names: dict[str, str] | None = None,
    speaker_word: str = "Speaker",
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
            return segments_to_dialogue_markdown(segments, speaker_names, speaker_word)
        if _looks_sentence_segmented(segments) and _has_timing(segments):
            return segments_to_paragraph_markdown(segments)
        return segments_to_markdown([s.text for s in segments])

    sections: list[str] = []
    for chapter, segs in chapter_buckets(transcript):
        if _looks_sentence_segmented(segs) and _has_timing(segs):
            body = segments_to_paragraph_markdown(segs)
        else:
            body = segments_to_markdown([s.text for s in segs])
        if body:
            sections.append(f"## {escape_tags(chapter.title)}\n\n{body}")
    return "\n\n".join(sections)
