"""Turn a podcast episode's audio into a Transcript via the speech-to-text layer.

A picked episode's `url` is its audio enclosure. We download it, split it into
chunks under the provider's per-request length cap (Voxtral: 30 min), transcribe
each chunk, and assemble a Transcript — the same shape YouTube produces, so the
whole cleanup/compile/EPUB path downstream is reused unchanged.

The transcript is cached by audio URL: transcription is a metered API call, so a
re-compile (or an LLM-role change) must never pay to transcribe the same episode
twice. Everything is best-effort: with no STT endpoint configured, or on any
download/transcription failure, the episode is skipped exactly like a YouTube
video with no subtitles — it never breaks the compile.
"""

import json
import logging
import shutil
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app.core.config import settings
from app.core.database import get_connection
from app.pipeline.transcribe import TranscribeError, stt_available, transcribe_file
from app.sources.models import Transcript, TranscriptSegment

logger = logging.getLogger(__name__)

_DOWNLOAD_TIMEOUT_S = 120.0
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def load_episode_transcript(audio_url: str) -> Transcript | None:
    """Cached transcript for a podcast episode, or None if it can't be produced."""
    cached = _get_cached(audio_url)
    if cached is not None:
        return cached

    transcript = _transcribe_episode(audio_url)
    if transcript is not None:
        _store(transcript)
    return transcript


def _transcribe_episode(audio_url: str) -> Transcript | None:
    if not stt_available():
        logger.info("No STT endpoint configured; skipping podcast %s", audio_url)
        return None

    workdir = Path(tempfile.mkdtemp(prefix="thothly-podcast-"))
    try:
        audio_path = _download(audio_url, workdir)
        if audio_path is None:
            return None
        chunks = _split(audio_path, settings.stt_max_chunk_minutes)
        texts = _transcribe_chunks(chunks)
    except TranscribeError as exc:
        # One chunk failing leaves a gap, so we drop the whole episode rather
        # than emit a silently-incomplete chapter (the spent calls are wasted,
        # but a partial transcript is worse than a clean skip).
        logger.warning("Transcription failed for %s: %s", audio_url, exc)
        return None
    except Exception as exc:  # noqa: BLE001 — any failure → graceful skip
        logger.warning("Could not transcribe podcast %s: %s", audio_url, exc)
        return None
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    parts = [t for t in texts if t and t.strip()]
    if not parts:
        return None

    # One segment per chunk, with synthetic timing from the chunk offset. There
    # are no chapters, so timing is only nominal — cleanup joins the segment text
    # anyway; Voxtral output is punctuated, so it paragraphs cleanly with no LLM.
    chunk_s = settings.stt_max_chunk_minutes * 60
    segments = [
        TranscriptSegment(text=text.strip(), start_s=float(i * chunk_s), duration_s=float(chunk_s))
        for i, text in enumerate(parts)
    ]
    return Transcript(video_id=audio_url, language="", segments=segments)


def _download(audio_url: str, workdir: Path) -> Path | None:
    """Stream the episode audio to disk (episodes are large; never buffer in RAM).

    Follows redirects so tracking/wrapper URLs (podtrac, chartable…) resolve to
    the real file. The extension is preserved so ffmpeg can stream-copy it.
    """
    suffix = _suffix_from_url(audio_url)
    dest = workdir / f"episode{suffix}"
    try:
        with httpx.stream(
            "GET",
            audio_url,
            follow_redirects=True,
            timeout=_DOWNLOAD_TIMEOUT_S,
            headers={"User-Agent": _BROWSER_UA},
        ) as response:
            response.raise_for_status()
            with open(dest, "wb") as out:
                for chunk in response.iter_bytes():
                    out.write(chunk)
    except httpx.HTTPError as exc:
        logger.warning("Could not download episode %s: %s", audio_url, exc)
        return None
    return dest


def _split(path: Path, max_minutes: int) -> list[Path]:
    """Split audio into <= max_minutes chunks for the per-request length cap.

    Needs ffmpeg. Without it (or if probing/splitting fails) we fall back to the
    whole file as a single chunk: fine for short episodes, while long ones will
    be rejected by the provider and skipped. ffmpeg is therefore an optional
    system dependency that unlocks long-episode support.
    """
    if shutil.which("ffmpeg") is None:
        logger.info("ffmpeg not found; transcribing %s whole (long episodes may fail)", path.name)
        return [path]

    duration = _probe_duration(path)
    if duration is None or duration <= max_minutes * 60:
        return [path]

    pattern = str(path.with_name(f"chunk%03d{path.suffix}"))
    try:
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
             "-f", "segment", "-segment_time", str(max_minutes * 60),
             "-c", "copy", pattern],
            check=True,
            timeout=_DOWNLOAD_TIMEOUT_S,
        )
    except (subprocess.SubprocessError, OSError) as exc:
        logger.warning("ffmpeg split failed for %s (%s); using whole file", path.name, exc)
        return [path]

    chunks = sorted(path.parent.glob(f"chunk*{path.suffix}"))
    return chunks or [path]


def _probe_duration(path: Path) -> float | None:
    if shutil.which("ffprobe") is None:
        return None
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(path)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return float(out.stdout.strip())
    except (subprocess.SubprocessError, OSError, ValueError):
        return None


def _transcribe_chunks(chunks: list[Path]) -> list[str]:
    """Transcribe chunks in parallel, preserving order. A single chunk's failure
    propagates (TranscribeError) so the caller drops the whole episode."""
    workers = max(1, settings.stt_max_concurrency)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(transcribe_file, chunks))


def _suffix_from_url(audio_url: str) -> str:
    suffix = Path(httpx.URL(audio_url).path).suffix.lower()
    # Keep only plausible audio container extensions; default to .mp3 otherwise
    # (the most common podcast enclosure, and a safe ffmpeg stream-copy target).
    return suffix if suffix in {".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav"} else ".mp3"


# --- cache (podcast_transcript_cache), mirrors transcript_cache.py -------------
def _get_cached(audio_url: str) -> Transcript | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM podcast_transcript_cache WHERE audio_url = ?", (audio_url,)
        ).fetchone()
    if row is None:
        return None
    segments = [TranscriptSegment(**s) for s in json.loads(row["segments"])]
    return Transcript(video_id=audio_url, language=row["language"], segments=segments)


def _store(transcript: Transcript) -> None:
    segments_json = json.dumps([s.model_dump() for s in transcript.segments])
    with get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO podcast_transcript_cache "
            "(audio_url, language, segments, fetched_at) VALUES (?, ?, ?, ?)",
            (
                transcript.video_id,
                transcript.language,
                segments_json,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()
