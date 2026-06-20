from datetime import datetime

from pydantic import BaseModel


class VideoMeta(BaseModel):
    id: str
    title: str
    url: str
    duration_s: int | None = None
    published_at: datetime | None = None


class TranscriptSegment(BaseModel):
    text: str
    start_s: float
    duration_s: float
    # Speaker label from diarization (e.g. "speaker_1"), when the source supports
    # it (Voxtral podcasts). None for YouTube subtitles and any provider that
    # doesn't diarize — the rendering then falls back to plain paragraphs.
    speaker: str | None = None


class Chapter(BaseModel):
    """A YouTube video chapter (timestamped section), used to structure the
    transcript into sub-headings in the EPUB."""

    title: str
    start_s: float
    end_s: float


class Transcript(BaseModel):
    video_id: str
    language: str
    segments: list[TranscriptSegment]
    chapters: list[Chapter] = []
    # Channel name → chapter author; channel page URL → cover avatar emblem.
    uploader: str | None = None
    channel_url: str | None = None

    @property
    def full_text(self) -> str:
        return " ".join(s.text for s in self.segments)


class ArticleMeta(BaseModel):
    url: str
    title: str
    published_at: datetime | None = None
    author: str | None = None


class Article(ArticleMeta):
    content_html: str
