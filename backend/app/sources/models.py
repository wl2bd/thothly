from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, HttpUrl

ItemType = Literal["youtube", "blog", "podcast"]
SourceKind = Literal["youtube_video", "youtube_playlist", "youtube_channel", "podcast", "blog"]


def is_punctuated(text: str) -> bool:
    """Whether a transcript carries real sentence punctuation.

    YouTube auto-captions are inconsistent: newer ASR adds punctuation, older
    tracks have none at all. About one sentence-ending mark per 50 words tells
    them apart; a stray mark or two in a raw transcript stays below it.
    """
    words = len(text.split())
    if words < 20:
        return False
    marks = sum(text.count(c) for c in ".!?")
    return marks / words >= 0.02


class VideoMeta(BaseModel):
    id: str
    title: str
    url: str
    duration_s: int | None = None


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

    @property
    def is_punctuated(self) -> bool:
        return is_punctuated(self.full_text)

class ArticleMeta(BaseModel):
    url: str
    title: str
    published_at: datetime | None = None
    author: str | None = None


class Article(ArticleMeta):
    content_html: str
    # The language the page declares (<html lang>), when it does.
    language: str | None = None
    # Set when a feed entry carries an audio enclosure (a podcast episode).
    audio_url: str | None = None
    duration_s: int | None = None


class DiscoveredItem(BaseModel):
    """One thing a source unfolded into, as discovery found it."""

    title: str
    url: str
    item_type: ItemType
    source_index: int
    item_index: int
    estimated_duration_s: int | None = None
    estimated_size_chars: int | None = None
    # A feed entry's opening, kept as a fallback when the page won't scrape.
    preview_html: str | None = None
    # The show's RSS feed, which may publish the episode's transcript.
    feed_url: str | None = None
    # Read off the transcript when discovery could fetch it. has_transcript is
    # tri-state: True = usable, False = none (the item will be skipped), None =
    # unknown (YouTube couldn't be reached, or the item wasn't probed).
    has_transcript: bool | None = None
    transcript_lang: str | None = None
    is_punctuated: bool | None = None
    word_count: int | None = None
    reading_time_min: int | None = None
    # A homepage link kept but not surely an article (it sat in running prose):
    # listed at review, unselected by default.
    uncertain: bool = False
    # Why the discovery triage doubts this item ("Likely off-topic"): it starts
    # unchecked at review, with this reason on its row.
    set_aside: str | None = None


class SourceSpec(BaseModel):
    """What to discover: a URL, plus what a search result knew about it.

    A pasted URL carries only `url` and its kind is detected from it. A picked
    search result adds what the URL can't tell: a podcast episode's audio URL
    isn't self-identifying, and its title, length and feed live only in the
    result.
    """

    url: HttpUrl
    kind: SourceKind | None = None
    title: str | None = None
    duration_s: int | None = None
    # The show's RSS feed: some publish each episode's transcript, read for free.
    feed_url: Annotated[str | None, Field(max_length=2000)] = None
    # The search that found this source. Absent for a pasted URL.
    query: Annotated[str | None, Field(max_length=200)] = None
