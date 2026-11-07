"""Turn a podcast episode's audio into a Transcript via the speech-to-text layer.

A published transcript is looked up first, in the show's own RSS feed
(rss_transcript.py, free) then Exa's index (exa_podcast.py); only when there
is none does the audio get transcribed here.

A picked episode's `url` is its audio enclosure. We download it and transcribe
it — in a single request when it fits under the provider's length cap (so the
diarization speaker ids stay consistent across the whole episode), splitting
into chunks only for very long ones. Each segment keeps its timestamp and, when
the provider diarizes (Voxtral), its speaker — the same shape YouTube produces,
so the cleanup/compile/EPUB path downstream is reused unchanged.

The transcript is cached by audio URL: transcription is a metered API call, so a
re-compile (or an LLM-role change) must never pay to transcribe the same episode
twice. Everything is best-effort: with no STT endpoint configured, or on any
download/transcription failure, the episode is skipped exactly like a YouTube
video with no subtitles — it never breaks the compile.
"""

import logging
import shutil
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

from app.core.config import settings
from app.core.net import BlockedURLError, open_public
from app.pipeline.providers import Endpoint
from app.pipeline.transcribe import (
    STTResult,
    TranscribeError,
    stt_available,
    transcribe_file,
)
from app.sources import exa_podcast, rss_transcript, transcript_cache
from app.sources.models import DiscoveredItem, Transcript, TranscriptSegment

logger = logging.getLogger(__name__)

_DOWNLOAD_TIMEOUT_S = 120.0


def load_episode_transcript(
    item: DiscoveredItem, stt: Endpoint | None = None
) -> Transcript | None:
    """The episode's transcript: published if there is one, else transcribed.

    None when neither is possible (no STT endpoint, a failed download or
    transcription): the episode is then skipped, like a video without subtitles.
    """
    transcript = find_published_transcript(item)
    if transcript is None:
        transcript = _transcribe_episode(item.url, stt)
        if transcript is not None:
            transcript_cache.put(transcript.video_id, transcript)
    return transcript


def find_published_transcript(item: DiscoveredItem) -> Transcript | None:
    """The cached or published transcript, never a transcription.

    The show's feed is read first (free), then Exa's podcast index: one
    flat-priced lookup instead of a per-minute bill. A hit is cached."""
    cached = cached_episode_transcript(item.url)
    if cached is not None:
        return cached
    transcript = None
    if item.feed_url:
        transcript = rss_transcript.find_transcript(item.feed_url, item.url, item.title)
    if transcript is None and item.title and exa_podcast.available():
        transcript = exa_podcast.find_transcript(
            item.url, item.title, item.estimated_duration_s
        )
    if transcript is not None:
        transcript_cache.put(transcript.video_id, transcript)
    return transcript


def cached_episode_transcript(audio_url: str) -> Transcript | None:
    return transcript_cache.get(audio_url)


def _transcribe_episode(audio_url: str, stt: Endpoint | None) -> Transcript | None:
    if not stt_available(stt):
        logger.info("No STT endpoint configured; skipping podcast %s", audio_url)
        return None

    workdir = Path(tempfile.mkdtemp(prefix="thothly-podcast-"))
    try:
        audio_path = _download(audio_url, workdir)
        if audio_path is None:
            return None
        chunks = _split(audio_path, settings.stt_max_chunk_minutes)
        results = _transcribe_chunks(chunks, stt)
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

    segments = _assemble_segments(chunks, results)
    if not segments:
        return None
    return Transcript(video_id=audio_url, language="", segments=segments)


def _assemble_segments(
    chunks: list[Path], results: list[STTResult]
) -> list[TranscriptSegment]:
    """Flatten the per-chunk results into one globally-timed segment list.

    Each chunk's timestamps are local to that chunk, so we offset them by the
    cumulative duration of the earlier chunks. Speaker ids are only consistent
    within a single request, so we keep them only when the whole episode was one
    chunk; across chunks we drop them (timing stays) rather than assert a
    speaker identity we can't verify.
    """
    single = len(chunks) == 1
    durations = [(_probe_duration(c) or 0.0) for c in chunks]

    segments: list[TranscriptSegment] = []
    offset = 0.0
    for chunk_dur, result in zip(durations, results):
        if result.segments:
            for s in result.segments:
                segments.append(
                    TranscriptSegment(
                        text=s.text,
                        start_s=offset + s.start,
                        duration_s=max(0.0, s.end - s.start),
                        speaker=s.speaker if single else None,
                    )
                )
            # Trust the segments' own span over a separate probe when available.
            chunk_dur = max((s.end for s in result.segments), default=chunk_dur)
        elif result.text.strip():
            # Provider returned only flat text (no segments): one coarse segment.
            segments.append(
                TranscriptSegment(
                    text=result.text.strip(),
                    start_s=offset,
                    duration_s=chunk_dur,
                    speaker=None,
                )
            )
        offset += chunk_dur
    return segments


def _download(audio_url: str, workdir: Path) -> Path | None:
    """Stream the episode audio to disk (episodes are large; never buffer in RAM),
    under a hard byte cap so a runaway enclosure can't fill the disk. Tracking
    wrappers (podtrac, chartable…) redirect to the real file. The extension is
    kept so ffmpeg can stream-copy it."""
    dest = workdir / f"episode{_suffix_from_url(audio_url)}"
    max_bytes = settings.stt_max_download_mb * 1024 * 1024
    try:
        with open_public(audio_url, timeout=_DOWNLOAD_TIMEOUT_S) as response, open(dest, "wb") as out:
            written = 0
            for chunk in response.iter_bytes():
                written += len(chunk)
                if written > max_bytes:
                    logger.warning(
                        "Episode %s exceeds the %d MB cap; skipping",
                        audio_url, settings.stt_max_download_mb,
                    )
                    return None
                out.write(chunk)
        return dest
    except (httpx.HTTPError, BlockedURLError) as exc:
        logger.warning("Could not download episode %s: %s", audio_url, exc)
        return None


def _split(path: Path, max_minutes: int) -> list[Path]:
    """Split audio into <= max_minutes chunks for the per-request length cap.

    Needs ffmpeg. Without it (or if probing/splitting fails) we fall back to the
    whole file as a single chunk: fine for typical episodes, while very long
    ones will be rejected by the provider and skipped. ffmpeg is therefore an
    optional system dependency that unlocks long-episode support.
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


def _transcribe_chunks(chunks: list[Path], stt: Endpoint | None) -> list[STTResult]:
    """Transcribe chunks in parallel, preserving order. A single chunk's failure
    propagates (TranscribeError) so the caller drops the whole episode."""
    workers = max(1, settings.stt_max_concurrency)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(lambda c: transcribe_file(c, endpoint=stt), chunks))


def _suffix_from_url(audio_url: str) -> str:
    suffix = Path(httpx.URL(audio_url).path).suffix.lower()
    # Keep only plausible audio container extensions; default to .mp3 otherwise
    # (the most common podcast enclosure, and a safe ffmpeg stream-copy target).
    return suffix if suffix in {".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav"} else ".mp3"
