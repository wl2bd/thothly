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


class Transcript(BaseModel):
    video_id: str
    language: str
    segments: list[TranscriptSegment]

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
