import logging
import re

from app.core.config import settings
from app.jobs.models import DiscoveredItemResponse
from app.jobs.repository import (
    get_job,
    get_job_llm_roles,
    get_selected_items,
    set_item_compile_state,
    update_job_status,
)
from app.pipeline.cleanup import (
    clean_markdown,
    clean_transcript,
    generate_preface,
    map_speaker_names,
)
from app.pipeline.compiler import (
    CompilationError,
    compile_book,
    demote_headings,
    html_to_markdown,
    strip_leading_title,
    transcript_to_markdown,
)
from app.pipeline.llm import llm_available
from app.pipeline.models import CompiledChapter
from app.pipeline.roles import PREFACE, has_role
from app.pipeline.titles import normalize_title
from app.render.epub import render_epub
from app.sources.blog import ScrapeUnavailable, scrape_article
from app.sources.podcast import load_episode_transcript
from app.sources.transcript_cache import load_transcript
from app.sources.youtube import YouTubeUnavailable

logger = logging.getLogger(__name__)


class ItemSkipped(Exception):
    """One item has nothing usable to build a chapter from.

    Carries the user-facing reason, exactly like YouTubeUnavailable and
    ScrapeUnavailable next door. Raised by the chapter builders and caught per
    item by the loop, which records the reason against the item and carries on:
    an item the user picked never disappears without an explanation, and never
    costs them the rest of the compilation.
    """


# The reasons an item didn't make it into the book. They travel with the item to
# the compile screen and survive to the finished one, so they're written for a
# reader rather than a log: what happened, no blame, no jargon.
NO_SUBTITLES = "No subtitles available."
NO_TRANSCRIPTION = "Transcription unavailable."
NO_CONTENT = "No readable content."
YOUTUBE_RATE_LIMITED = "YouTube rate-limited this request."
ITEM_FAILED = "This item could not be built."

# Zero survivors, but not for lack of content: at least one item crashed rather
# than being genuinely skipped. compile_book's "no usable content" message would
# be actively misleading here (it tells the user to check subtitles and readable
# text, when the real cause was an error the log already has), so this case gets
# its own, honest message instead of falling through to that one.
NOTHING_BUILT = "None of the selected items could be built. Try again, or pick different sources."


def run_compilation(job_id: str) -> None:
    """Background phase: turn the selected items into a single EPUB.

    Default is zero-LLM: native subtitles grouped into paragraphs, never
    rewritten; videos without subtitles are skipped; blogs come from the article
    page (or the RSS preview if scraping fails). When the user selected LLM roles
    *and* an LLM is configured, the selected items are run through the cleanup
    engine instead (cached, with graceful fallback to the free path on failure).
    """
    try:
        items = get_selected_items(job_id)
        # Active only when roles were chosen AND an LLM endpoint is configured.
        roles = get_job_llm_roles(job_id) if llm_available() else []
        model = settings.llm_model or ""
        chapters: list[CompiledChapter] = []
        youtube_unavailable = False
        # Items that ended `failed` (crashed or hit a YouTube rate limit), as
        # opposed to `skipped` (nothing usable to build from). The distinction
        # drives which zero-survivor message is honest: `skipped` means the
        # content genuinely wasn't there; `failed` means something broke, and the
        # "check that the videos have subtitles" message below would be wrong.
        failed_items = 0

        for item in items:
            set_item_compile_state(job_id, item.id, "compiling")
            try:
                if item.item_type == "youtube":
                    chapter = _youtube_chapter(item, job_id, roles, model)
                elif item.item_type == "podcast":
                    chapter = _podcast_chapter(item, job_id, roles, model)
                else:
                    chapter = _blog_chapter(item, job_id, roles, model)
            except ItemSkipped as exc:
                # Nothing usable to build from. Expected, explainable, and never
                # fatal: the reason is written against the item and shown next to
                # it, on this screen and on the finished one.
                logger.info("Skipped %s (job %s): %s", item.url, job_id, exc)
                set_item_compile_state(job_id, item.id, "skipped", str(exc))
                continue
            except YouTubeUnavailable as exc:
                # External and usually transient (a 429 from this IP), so it reads
                # as failed rather than skipped: retrying later is the actual fix.
                logger.error("YouTube unavailable for %s (job %s): %s", item.url, job_id, exc)
                youtube_unavailable = True
                failed_items += 1
                set_item_compile_state(job_id, item.id, "failed", YOUTUBE_RATE_LIMITED)
                continue
            except Exception:
                # One broken item must not cost the user the other nine. The raw
                # cause goes to the log; the item gets one calm written line, and
                # the compile carries on with what's left.
                logger.exception("Item %s failed (job %s)", item.url, job_id)
                failed_items += 1
                set_item_compile_state(job_id, item.id, "failed", ITEM_FAILED)
                continue
            chapters.append(chapter)
            set_item_compile_state(job_id, item.id, "done")

        # Ordered on purpose: a wholly rate-limited run is both the most specific
        # diagnosis (an external, transient cause) and the most actionable one
        # (wait, or use a residential proxy), so it's checked first even though
        # it's also a case where failed_items > 0. Next, any other crash: honest
        # over blaming the content, so it doesn't get funnelled into "check that
        # the videos have subtitles" below. Falling through both leaves only the
        # case where every item was genuinely `skipped` for lack of content, which
        # is exactly what compile_book's own "no usable content" message says.
        if not chapters and youtube_unavailable:
            raise CompilationError(
                "YouTube is rate-limiting transcript requests (HTTP 429) from this "
                "IP. This usually clears after a while, so try again later. For a "
                "self-hosted server, a residential proxy avoids it."
            )
        if not chapters and failed_items > 0:
            raise CompilationError(NOTHING_BUILT)

        job = get_job(job_id)
        book_title = (job.book_title if job else None) or "Compilation Thothly"
        book = compile_book(chapters, book_title)
        if has_role(roles, PREFACE):
            book.preface = generate_preface(book.title, [c.title for c in book.chapters])
        output_path, output_md_path = _render(book, job_id)
        update_job_status(
            job_id,
            "completed",
            book_title=book.title,
            output_path=output_path,
            output_md_path=output_md_path,
        )
        logger.info("Compilation done for job %s: %d chapters", job_id, len(book.chapters))

    except CompilationError as exc:
        # CompilationError carries a hand-written, user-facing reason (no content,
        # YouTube rate-limited); surface it as-is.
        logger.warning("No usable content for job %s: %s", job_id, exc)
        update_job_status(job_id, "failed", error=str(exc))
    except Exception:
        # Anything else (a Pandoc render error, a network blip) keeps its raw
        # message in the log; the user gets one calm, written line instead.
        logger.exception("Compilation failed for job %s", job_id)
        update_job_status(
            job_id,
            "failed",
            error="The compilation failed to build. Try again.",
        )


def _youtube_chapter(
    item: DiscoveredItemResponse, job_id: str, roles: list[str], model: str
) -> CompiledChapter:
    video_id = _extract_video_id(item.url)
    # Cache hit from discovery (full segments + chapters); falls back to a live
    # fetch only if the cache was never populated. A YouTubeUnavailable here
    # (e.g. a 429) propagates so run_compilation can report it clearly.
    transcript = load_transcript(video_id)
    if transcript is None:
        raise ItemSkipped(NO_SUBTITLES)

    # The free path (no roles selected) renders captions with the zero-LLM
    # grouper. Raw (unpunctuated) captions then read rough — there's no zero-LLM
    # way to paragraph them — which is the trade-off of leaving "AI polish" off;
    # turning it on adds the Punctuation pass (and clean_transcript falls back to
    # a free sentence-split on captions that are already punctuated).
    if roles:
        content_md = clean_transcript(transcript, roles, model)
    else:
        content_md = transcript_to_markdown(transcript)
    if not content_md:
        raise ItemSkipped(NO_CONTENT)

    return CompiledChapter(
        title=normalize_title(item.title),
        source_type="youtube",
        source_url=item.url,
        author=transcript.uploader,
        channel_url=transcript.channel_url,
        content_md=content_md,
    )


def _podcast_chapter(
    item: DiscoveredItemResponse, job_id: str, roles: list[str], model: str
) -> CompiledChapter:
    # Transcribe lazily (and cached by audio URL): a metered API call runs once,
    # only for selected episodes. No STT endpoint, or a download/transcription
    # failure, leaves transcript None → the episode is skipped, like a video
    # without subtitles.
    transcript = load_episode_transcript(item.url)
    if transcript is None:
        raise ItemSkipped(NO_TRANSCRIPTION)

    # Podcasts keep their diarized dialogue with speaker labels. The Voxtral
    # transcript is already punctuated and clean, so we deliberately do NOT run
    # the content-editing roles here — that path flattens the text and drops the
    # who-speaks labels. Real speaker names via the LLM are opt-in
    # (podcast_speaker_naming); off by default → simple "Speaker N" titles.
    speaker_names = (
        map_speaker_names(transcript, model) if settings.podcast_speaker_naming else {}
    )
    content_md = transcript_to_markdown(transcript, speaker_names)
    if not content_md:
        raise ItemSkipped(NO_CONTENT)

    return CompiledChapter(
        title=normalize_title(item.title),
        source_type="podcast",
        source_url=item.url,
        content_md=content_md,
    )


def _blog_chapter(
    item: DiscoveredItemResponse, job_id: str, roles: list[str], model: str
) -> CompiledChapter:
    author = None
    published_at = None
    try:
        article = scrape_article(item.url)
        content_html = article.content_html
        author = article.author
        published_at = article.published_at
    except ScrapeUnavailable:
        logger.warning("Scrape failed for %s (job %s), using RSS preview", item.url, job_id)
        content_html = item.preview_html or ""

    content_md = html_to_markdown(content_html)
    content_md = demote_headings(strip_leading_title(content_md, item.title))
    if not content_md:
        raise ItemSkipped(NO_CONTENT)

    if roles:
        content_md = clean_markdown(content_md, roles, model, content_key=item.url)

    return CompiledChapter(
        title=normalize_title(item.title),
        source_type="blog",
        source_url=item.url,
        author=author,
        published_at=published_at,
        content_md=content_md,
    )


def _extract_video_id(url: str) -> str:
    match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]+)", url)
    return match.group(1) if match else url.rstrip("/").split("/")[-1]


def _render(book, job_id: str) -> tuple[str, str]:
    output_dir = settings.data_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{job_id}.epub"
    render_epub(book, output_path)

    # A standalone Markdown twin of the same compiled content — no Pandoc, no
    # image localization — so the reading list can be fed straight to an AI (or
    # any plain-text tool). The non-localized Markdown keeps remote image URLs
    # referenceable, unlike the EPUB's embedded copies.
    md_path = output_dir / f"{job_id}.md"
    md_path.write_text(book.to_markdown(), encoding="utf-8")
    return str(output_path), str(md_path)
