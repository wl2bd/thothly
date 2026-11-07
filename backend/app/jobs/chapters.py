"""One chapter per picked item, for each kind of item.

`draft` reads an item and renders it without any AI: that is the free path's
chapter, and the review screen's preview of it. `polish` then applies what the
visitor's model was asked to do. The compile and the preview share `draft`, so
what review shows is what lands in the book.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum

from app.core.config import settings
from app.pipeline.cleanup import StopCheck, clean_markdown, clean_transcript, map_speaker_names
from app.pipeline.html_md import demote_headings, html_to_markdown, strip_leading_title
from app.pipeline.transcript_md import transcript_to_markdown
from app.pipeline.i18n import chrome, detect_language, normalize_language
from app.pipeline.models import CompiledChapter
from app.pipeline.providers import Endpoint
from app.pipeline.titles import normalize_title
from app.sources import youtube
from app.sources.blog import ScrapeUnavailable, scrape_article
from app.sources.models import DiscoveredItem, Transcript
from app.sources import transcript_cache
from app.sources.podcast import load_episode_transcript

logger = logging.getLogger(__name__)

YOUTUBE_BUSY = (
    "YouTube didn't respond. It rate-limits requests from some networks, so "
    "try again in a little while."
)

Step = Callable[[str], None]


class SkipReason(Enum):
    """Why an item has nothing to build a chapter from.

    Each reason carries both texts, written for a reader: the note that travels
    with the item to the compile screen and the finished one, and the sentence
    the review preview shows. Code compares reasons, never their text.
    """

    NO_SUBTITLES = (
        "No subtitles available.",
        "This video has no subtitles, so it would be skipped when compiling.",
    )
    NO_TRANSCRIPTION = (
        "Transcription unavailable.",
        "This episode has no published transcript, so its text is made from "
        "the audio when compiling.",
    )
    NO_CONTENT = (
        "No readable content.",
        "There's no readable content here, so it would be skipped when compiling.",
    )

    def __init__(self, note: str, preview_note: str):
        self.note = note
        self.preview_note = preview_note


class ItemSkipped(Exception):
    """The item has nothing usable to build a chapter from."""

    def __init__(self, reason: SkipReason):
        super().__init__(reason.note)
        self.reason = reason


@dataclass
class Draft:
    chapter: CompiledChapter
    # What a polish re-reads: the transcript of a video or an episode.
    transcript: Transcript | None = None
    # A caveat on the free text, shown with its preview.
    note: str | None = None


def draft(
    item: DiscoveredItem,
    *,
    transcribe: bool,
    stt: Endpoint | None = None,
    step: Step = lambda _: None,
) -> Draft:
    """The item's chapter with no AI involved.

    `transcribe` lets an episode without a published transcript be transcribed
    (metered); without it, only a transcript already in hand is used.
    Raises ItemSkipped when there is nothing to read, YouTubeUnavailable when
    YouTube refuses.
    """
    if item.item_type == "youtube":
        return _youtube(item, step)
    if item.item_type == "podcast":
        return _podcast(item, transcribe, stt, step)
    return _blog(item, step)


def polish(
    item: DiscoveredItem,
    drafted: Draft,
    roles: list[str],
    llm: Endpoint | None,
    *,
    should_stop: StopCheck = None,
    step: Step = lambda _: None,
) -> CompiledChapter:
    """The draft with the visitor's AI roles applied. Episodes keep their
    diarized text untouched: the content roles would flatten it and drop who
    speaks; only their speaker labels may be named."""
    chapter = drafted.chapter
    if item.item_type == "podcast":
        if not settings.podcast_speaker_naming:
            return chapter
        names = map_speaker_names(drafted.transcript, llm)
        if not names:
            return chapter
        content = transcript_to_markdown(
            drafted.transcript, names, chrome(chapter.language)["speaker"]
        )
        return chapter.model_copy(update={"content_md": content})
    if not roles:
        return chapter
    step("Polishing the text")
    if item.item_type == "youtube":
        content = clean_transcript(drafted.transcript, roles, llm, should_stop=should_stop)
    else:
        content = clean_markdown(
            chapter.content_md, roles, content_key=item.url, language=chapter.language,
            endpoint=llm, should_stop=should_stop,
        )
    if not content:
        raise ItemSkipped(SkipReason.NO_CONTENT)
    return chapter.model_copy(update={"content_md": content})


def _youtube(item: DiscoveredItem, step: Step) -> Draft:
    step("Reading the transcript")
    transcript = youtube.load_transcript(youtube.video_id(item.url))
    if transcript is None:
        raise ItemSkipped(SkipReason.NO_SUBTITLES)
    content = transcript_to_markdown(transcript)
    if not content.strip():
        raise ItemSkipped(SkipReason.NO_CONTENT)
    return Draft(
        CompiledChapter(
            title=normalize_title(item.title),
            source_type="youtube",
            source_url=item.url,
            author=transcript.uploader,
            channel_url=transcript.channel_url,
            content_md=content,
            language=normalize_language(transcript.language) or detect_language(content),
        ),
        transcript,
    )


def _podcast(
    item: DiscoveredItem, transcribe: bool, stt: Endpoint | None, step: Step
) -> Draft:
    step("Getting the transcript")
    transcript = (
        load_episode_transcript(item, stt) if transcribe else transcript_cache.get(item.url)
    )
    if transcript is None:
        raise ItemSkipped(SkipReason.NO_TRANSCRIPTION)
    # Transcription rarely reports a language, so it is read off the words.
    language = normalize_language(transcript.language) or detect_language(transcript.full_text)
    content = transcript_to_markdown(transcript, {}, chrome(language)["speaker"])
    if not content.strip():
        raise ItemSkipped(SkipReason.NO_CONTENT)
    return Draft(
        CompiledChapter(
            title=normalize_title(item.title),
            source_type="podcast",
            source_url=item.url,
            content_md=content,
            language=language,
        ),
        transcript,
    )


def _blog(item: DiscoveredItem, step: Step) -> Draft:
    step("Fetching the article")
    try:
        article = scrape_article(item.url)
    except ScrapeUnavailable:
        logger.info("Scrape failed for %s, using the feed's summary", item.url)
        article, html = None, item.preview_html or ""
        note = "The full article didn't load, so this is the RSS summary only."
    else:
        html, note = article.content_html, None
    content = demote_headings(strip_leading_title(html_to_markdown(html), item.title))
    if not content.strip():
        raise ItemSkipped(SkipReason.NO_CONTENT)
    declared = article.language if article else None
    return Draft(
        CompiledChapter(
            title=normalize_title(item.title),
            source_type="blog",
            source_url=item.url,
            author=article.author if article else None,
            published_at=article.published_at if article else None,
            content_md=content,
            language=normalize_language(declared) or detect_language(content),
        ),
        note=note,
    )
