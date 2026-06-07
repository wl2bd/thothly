"""Persistent, video-keyed transcript cache.

Fetching a transcript hits YouTube, which IP-rate-limits scrapers. The same
video is fetched repeatedly otherwise — once per discovery, again at compile,
and again every time the user re-opens the same playlist. Caching by video_id
collapses all of that to a single fetch per video, ever.

Only successful fetches are cached. A "no subtitles" (None) result is left
uncached so a video that later gains captions is picked up, and an IP block
(YouTubeUnavailable) propagates untouched — we must never cache a block as if
the video had no subtitles.
"""

import json
from datetime import datetime, timezone

from app.core.database import get_connection
from app.sources.models import Transcript, TranscriptSegment
from app.sources.youtube import fetch_transcript


def load_transcript(
    video_id: str, languages: list[str] | None = None
) -> Transcript | None:
    cached = _get_cached(video_id)
    if cached is not None:
        return cached

    transcript = fetch_transcript(video_id, languages)
    if transcript is not None:
        _store(transcript)
    return transcript


def _get_cached(video_id: str) -> Transcript | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM transcript_cache WHERE video_id = ?", (video_id,)
        ).fetchone()
    if row is None:
        return None
    segments = [TranscriptSegment(**s) for s in json.loads(row["segments"])]
    return Transcript(
        video_id=video_id, language=row["language"], segments=segments
    )


def _store(transcript: Transcript) -> None:
    payload = json.dumps([s.model_dump() for s in transcript.segments])
    with get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO transcript_cache "
            "(video_id, language, segments, fetched_at) VALUES (?, ?, ?, ?)",
            (
                transcript.video_id,
                transcript.language,
                payload,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()
