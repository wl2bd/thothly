"""Apply selected LLM roles to content, with caching and graceful fallback.

Runs at compile time on the items the user selected. Each role is a faithful
transform; results are cached by (content, role-set, model) so a re-compile is
free. Any LLM failure falls back to the free zero-LLM path and is never fatal —
a cleaned result is only cached when every call in it succeeded.
"""

import json
import logging
import re
from bisect import bisect_right
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from difflib import SequenceMatcher

from app.core.config import settings
from app.core.database import get_connection
from app.pipeline.compiler import is_punctuated, segments_to_markdown
from app.pipeline.llm import LLMError, complete, llm_available
from app.pipeline.roles import (
    COPYEDIT,
    PREFACE,
    PUNCTUATE,
    SECTIONS,
    get_role,
    has_role,
    sections_prompt,
    selected_item_roles,
)
from app.sources.models import Transcript

logger = logging.getLogger(__name__)

_ATX_HEADING = re.compile(r"(?m)^#{1,6}\s")


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------
def clean_transcript(transcript: Transcript, role_ids: list[str], model: str) -> str:
    """Markdown for a video transcript with the selected item-roles applied."""
    roles_key = _roles_key(role_ids)
    cached = _get_cached(transcript.video_id, roles_key, model)
    if cached is not None:
        return cached

    md, ok = _build_transcript(transcript, role_ids)
    if ok:
        _store(transcript.video_id, roles_key, model, md)
    return md


def clean_markdown(
    content_md: str, role_ids: list[str], model: str, *, content_key: str
) -> str:
    """Apply the article-applicable roles (copyedit, sections) to blog markdown."""
    roles_key = _roles_key(role_ids)
    cached = _get_cached(content_key, roles_key, model)
    if cached is not None:
        return cached

    body = content_md
    ok = True
    if has_role(role_ids, COPYEDIT) and body.strip():
        chunks = _group_paragraphs(body, settings.llm_chunk_words)
        edited, c_ok = _run_role(chunks, COPYEDIT, validate_copyedit)
        body = edited if edited.strip() else body
        ok = ok and c_ok
    # Only structure articles that have no headings of their own.
    if has_role(role_ids, SECTIONS) and body.strip() and not _ATX_HEADING.search(body):
        chunks = _group_paragraphs(body, settings.llm_chunk_words)
        structured, s_ok = _run_role(chunks, SECTIONS, validate_sections)
        body = structured if structured.strip() else body
        ok = ok and s_ok

    if ok:
        _store(content_key, roles_key, model, body)
    return body


_SPEAKER_NAMES_PROMPT = (
    "You are given a transcript of a conversation where each line is labelled "
    "with an anonymous speaker id (speaker_1, speaker_2, ...). Work out who each "
    "speaker is from the context — names they state, introductions, how they are "
    "addressed, or their role. Reply ONLY with a compact JSON object mapping "
    "every speaker id to a short display name: the person's real name when it is "
    "stated in the transcript, otherwise a role such as \"Host\" or \"Guest\". "
    "Use the language of the transcript for role words. Never invent a name that "
    "the text does not support; when unsure, use a role. JSON only, no commentary."
)


def map_speaker_names(transcript, model: str) -> dict[str, str]:
    """Map diarization speaker ids (speaker_1, …) to display names via the LLM.

    Returns {} — so the renderer falls back to generic "Speaker N" labels —
    when the LLM is unconfigured, the episode isn't multi-speaker, or anything
    fails. Cached per (episode, model) so a re-compile never re-calls the LLM.
    """
    speakers = _distinct_speakers(transcript.segments)
    if len(speakers) < 2 or not llm_available():
        return {}

    cached = _get_cached(transcript.video_id, _SPEAKER_NAMES_KEY, model)
    if cached is not None:
        return _filter_map(_safe_json(cached), speakers)

    try:
        raw = complete(_SPEAKER_NAMES_PROMPT, _dialogue_sample(transcript.segments), max_tokens=400)
    except LLMError as exc:
        logger.warning("Speaker-name mapping failed: %s", exc)
        return {}

    mapping = _parse_speaker_map(raw, speakers)
    if mapping:
        _store(transcript.video_id, _SPEAKER_NAMES_KEY, model, json.dumps(mapping))
    return mapping


_SPEAKER_NAMES_KEY = "speaker-names"


def _distinct_speakers(segments) -> list[str]:
    seen: dict[str, None] = {}
    for s in segments:
        if s.speaker:
            seen.setdefault(s.speaker, None)
    return list(seen)


def _dialogue_sample(segments, max_chars: int = 4000) -> str:
    """A speaker-labelled excerpt for the mapping prompt — consecutive same-
    speaker segments joined, capped so the call stays cheap (intros, where names
    are stated, come early anyway)."""
    lines: list[str] = []
    current: list[str] = []
    current_speaker: str | None = None
    total = 0
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        speaker = seg.speaker or "speaker_?"
        if current and speaker != current_speaker:
            lines.append(f"{current_speaker}: {' '.join(current)}")
            current = []
        if not current:
            current_speaker = speaker
        current.append(text)
        total += len(text)
        if total >= max_chars:
            break
    if current:
        lines.append(f"{current_speaker}: {' '.join(current)}")
    return "\n".join(lines)


def _parse_speaker_map(raw: str, speakers: list[str]) -> dict[str, str]:
    match = re.search(r"\{.*\}", raw, re.S)
    if not match:
        return {}
    return _filter_map(_safe_json(match.group(0)), speakers)


def _safe_json(text: str) -> dict:
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def _filter_map(data: dict, speakers: list[str]) -> dict[str, str]:
    """Keep only known speaker ids mapped to short, non-empty names."""
    return {
        k: v.strip()
        for k, v in data.items()
        if k in speakers and isinstance(v, str) and v.strip() and len(v.strip()) <= 60
    }


def generate_preface(book_title: str, chapter_titles: list[str]) -> str | None:
    """A short generated preface, or None if the LLM call fails."""
    role = get_role(PREFACE)
    if role is None:
        return None
    user = "Titre du livre : {}\n\nChapitres :\n{}".format(
        book_title, "\n".join(f"- {t}" for t in chapter_titles)
    )
    try:
        return complete(role.system_prompt, user)
    except LLMError as exc:
        logger.warning("Preface generation failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Transcript assembly
# ---------------------------------------------------------------------------
def _build_transcript(transcript: Transcript, role_ids: list[str]) -> tuple[str, bool]:
    roles = {r.id for r in selected_item_roles(role_ids)}
    do_punct = PUNCTUATE in roles
    do_copyedit = COPYEDIT in roles
    do_sections = SECTIONS in roles
    ok = True

    if transcript.chapters:
        # Chapters already give structure, so the `sections` role is a no-op here.
        sections_out: list[str] = []
        for title, texts in _bucket_by_chapter(transcript):
            body, body_ok = _body_from_texts(texts, do_punct, do_copyedit)
            ok = ok and body_ok
            if body:
                sections_out.append(f"## {title}\n\n{body}")
        return "\n\n".join(sections_out), ok

    texts = [s.text for s in transcript.segments]
    md, body_ok = _body_from_texts(texts, do_punct, do_copyedit)
    ok = ok and body_ok
    if do_sections and md.strip():
        chunks = _group_paragraphs(md, settings.llm_chunk_words)
        # Pin the generated headings to the transcript's own language rather than
        # let the model infer it from a chunk and drift to English.
        structured, sec_ok = _run_role(
            chunks, SECTIONS, validate_sections,
            system=sections_prompt(transcript.language),
        )
        md = structured if structured.strip() else md
        ok = ok and sec_ok
    return md, ok


def _body_from_texts(
    texts: list[str], do_punct: bool, do_copyedit: bool
) -> tuple[str, bool]:
    cleaned = [t.strip() for t in texts if t and t.strip()]
    if not cleaned:
        return "", True
    full = " ".join(cleaned)
    ok = True

    # Punctuation only earns its cost on raw (unpunctuated) captions; punctuated
    # tracks already sentence-split cleanly for free.
    if do_punct and not is_punctuated(full):
        chunks = _split_words(full, settings.llm_chunk_words)
        body, p_ok = _run_role(chunks, PUNCTUATE, validate_preserve)
        if not body.strip():
            body = segments_to_markdown(texts)  # nothing usable came back
        ok = ok and p_ok
    else:
        body = segments_to_markdown(texts)

    if do_copyedit and body.strip():
        chunks = _group_paragraphs(body, settings.llm_chunk_words)
        edited, c_ok = _run_role(chunks, COPYEDIT, validate_copyedit)
        body = edited if edited.strip() else body
        ok = ok and c_ok

    return body, ok


def _bucket_by_chapter(transcript: Transcript) -> list[tuple[str, list[str]]]:
    """Assign each segment to the last chapter that started at or before it."""
    starts = [c.start_s for c in transcript.chapters]
    buckets: list[list[str]] = [[] for _ in transcript.chapters]
    for segment in transcript.segments:
        index = max(0, bisect_right(starts, segment.start_s) - 1)
        buckets[index].append(segment.text)
    return [(c.title, b) for c, b in zip(transcript.chapters, buckets)]


# ---------------------------------------------------------------------------
# Chunked LLM application — parallel, fidelity-checked
#
# Each chunk is transformed independently, in a small thread pool, and its
# output is validated against the input before being accepted. A chunk that
# drifts (paraphrased / truncated / hallucinated) or whose call errors out
# falls back to its own source text, so one bad chunk can't corrupt the rest.
# Returns (text, no_transient_error): a transient API error leaves the result
# uncached so a later retry can still succeed; a deterministic fidelity reject
# does not (re-running the same model would drift the same way).
# ---------------------------------------------------------------------------
def _run_role(
    chunks: list[str], role_id: str, validate, *, system: str | None = None
) -> tuple[str, bool]:
    role = get_role(role_id)
    if not chunks:
        return "", True

    # `system` lets a caller pin a parameterised variant (e.g. a language-locked
    # sections prompt); otherwise the role's default prompt is used.
    outputs, no_transient = _transform_chunks(
        chunks, system or role.system_prompt, validate
    )
    pieces = [
        out if out is not None else raw  # None = fell back to the source chunk
        for raw, out in zip(chunks, outputs)
    ]
    return "\n\n".join(p for p in pieces if p.strip()), no_transient


def _transform_chunks(
    chunks: list[str], system: str, validate
) -> tuple[list[str | None], bool]:
    """Transform chunks in parallel. Output[i] is None when chunk i must fall
    back (drift or error). Second return is False if any call errored out."""
    results: list[str | None] = [None] * len(chunks)
    transient = False

    def work(index: int, chunk: str) -> tuple[int, str | None, bool]:
        try:
            out = complete(system, chunk, max_tokens=_budget(chunk))
        except LLMError as exc:
            logger.warning("Chunk %d: LLM error (%s) — using source text", index, exc)
            return index, None, True  # transient: don't cache, allow retry
        if not validate(chunk, out):
            logger.warning("Chunk %d: fidelity drift — using source text", index)
            return index, None, False  # deterministic: cache the safe fallback
        return index, out, False

    workers = max(1, settings.llm_max_concurrency)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for index, out, t in pool.map(lambda a: work(*a), list(enumerate(chunks))):
            results[index] = out
            transient = transient or t
    return results, not transient


def _budget(text: str) -> int:
    """Generous output-token budget so a faithful pass is never truncated."""
    return min(8192, max(512, int(len(text.split()) * 3) + 256))


# --- Fidelity validators (compare normalised word content, ignoring case
# and punctuation, since that is exactly what these roles are allowed to add) ---
_WORD_RE = re.compile(r"[^\w]+", re.UNICODE)


def _norm_words(text: str) -> list[str]:
    return _WORD_RE.sub(" ", text.lower()).split()


def _similar(a: list[str], b: list[str]) -> float:
    if not a and not b:
        return 1.0
    return SequenceMatcher(None, a, b, autojunk=False).ratio()


def validate_preserve(src: str, out: str) -> bool:
    """Punctuate/sections: word content must be virtually identical."""
    if not out.strip():
        return False
    s = _norm_words(src)
    o = _norm_words(out)
    if not s:
        return True
    return 0.95 <= len(o) / len(s) <= 1.05 and _similar(s, o) >= 0.92


def validate_copyedit(src: str, out: str) -> bool:
    """Copyedit removes fillers (some shrink is fine) but must never inflate."""
    if not out.strip():
        return False
    s = _norm_words(src)
    o = _norm_words(out)
    if not s:
        return True
    return 0.55 <= len(o) / len(s) <= 1.05


def validate_sections(src: str, out: str) -> bool:
    """Sections only adds heading lines; the remaining body must be preserved."""
    body = "\n".join(
        line for line in out.splitlines() if not _ATX_HEADING.match(line)
    )
    return validate_preserve(src, body)


def _split_words(text: str, max_words: int) -> list[str]:
    words = text.split()
    if not words:
        return []
    return [
        " ".join(words[i : i + max_words]) for i in range(0, len(words), max_words)
    ]


def _group_paragraphs(md: str, max_words: int) -> list[str]:
    paragraphs = [p for p in md.split("\n\n") if p.strip()]
    groups: list[str] = []
    current: list[str] = []
    current_words = 0
    for para in paragraphs:
        words = len(para.split())
        if current and current_words + words > max_words:
            groups.append("\n\n".join(current))
            current, current_words = [], 0
        current.append(para)
        current_words += words
    if current:
        groups.append("\n\n".join(current))
    return groups or [md]


# ---------------------------------------------------------------------------
# Cache (transcript_llm_cache) — mirrors transcript_cache.py
# ---------------------------------------------------------------------------
def _roles_key(role_ids: list[str]) -> str:
    return ",".join(sorted(set(role_ids)))


def _get_cached(content_key: str, roles_key: str, model: str) -> str | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT content_md FROM transcript_llm_cache "
            "WHERE content_key = ? AND roles_key = ? AND model = ?",
            (content_key, roles_key, model),
        ).fetchone()
    return row["content_md"] if row is not None else None


def _store(content_key: str, roles_key: str, model: str, content_md: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO transcript_llm_cache "
            "(content_key, roles_key, model, content_md, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                content_key,
                roles_key,
                model,
                content_md,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()
