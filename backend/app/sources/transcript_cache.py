"""Transcripts fetched or paid for once, kept for good, keyed by what they
transcribe: a video id or an episode's audio URL.

YouTube IP-rate-limits scrapers and would otherwise be asked for the same video
at discovery, at compile and on every re-opened playlist; an episode's
transcription is a metered call that a re-compile must never pay twice. Only a
found transcript is stored, so a video that later gains captions is picked up.
"""

from datetime import datetime, timezone

from app.core.database import get_connection
from app.sources.models import Transcript


def get(key: str) -> Transcript | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT transcript FROM transcripts WHERE key = ?", (key,)
        ).fetchone()
    return Transcript.model_validate_json(row["transcript"]) if row else None


def put(key: str, transcript: Transcript) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO transcripts (key, transcript, stored_at) VALUES (?, ?, ?)",
            (key, transcript.model_dump_json(), datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
