"""The compile, end to end against the test database. Only the outside world is
faked: YouTube, the scraped page, the episode transcript and Pandoc."""

from unittest.mock import patch

import pytest

from app.jobs import repository, runner
from app.jobs.models import DiscoveredItemResponse
from app.jobs.outputs import output_file
from app.pipeline.cleanup import CompileStopped
from app.pipeline.providers import Endpoint
from app.sources.models import Article, Transcript, TranscriptSegment
from app.sources.youtube import YouTubeUnavailable
from tests.conftest import confirmed_job

NO_USABLE_CONTENT = (
    "The selected items had no usable content. Check that the videos have "
    "subtitles and the articles have readable text."
)


def _item(n: int, item_type: str, url: str) -> DiscoveredItemResponse:
    return DiscoveredItemResponse(
        id=f"i{n}", source_index=0, item_index=n, item_type=item_type,
        title=f"Item {n}", url=url,
    )


def _video(n: int) -> DiscoveredItemResponse:
    return _item(n, "youtube", f"https://www.youtube.com/watch?v=vid{n}xyz")


def _transcript(text: str = "hello world") -> Transcript:
    return Transcript(
        video_id="v", language="en",
        segments=[TranscriptSegment(text=text, start_s=0.0, duration_s=1.0)],
    )


def _outcomes(job_id: str) -> list[tuple[str, str, str | None]]:
    return [(i.id, i.compile_state, i.compile_note) for i in repository.get_selected_items(job_id)]


@pytest.fixture(autouse=True)
def _pandoc(fake_pandoc):
    return fake_pandoc


@patch("app.jobs.chapters.youtube.load_transcript", return_value=_transcript())
def test_a_video_becomes_a_book_with_its_markdown_twin(_load):
    job_id = confirmed_job(_video(0))

    runner.run_compilation(job_id)

    job = repository.get_job(job_id)
    assert job.status == "completed"
    assert job.epub_bytes == 4
    assert "hello world" in output_file(job_id, "md").read_text(encoding="utf-8")
    assert _outcomes(job_id) == [("i0", "done", None)]


@patch("app.jobs.chapters.load_episode_transcript")
def test_an_episode_becomes_a_chapter(load):
    load.return_value = _transcript("Welcome to the show.")
    job_id = confirmed_job(_item(0, "podcast", "https://cdn.example/ep1.mp3"))

    runner.run_compilation(job_id)

    assert repository.get_job(job_id).status == "completed"


@patch("app.jobs.chapters.scrape_article")
def test_an_article_becomes_a_chapter(scrape):
    scrape.return_value = Article(
        url="https://blog.example.com/posts/hello", title="Item 0",
        author="Bob", content_html="<p>Article body.</p>",
    )
    job_id = confirmed_job(_item(0, "blog", "https://blog.example.com/posts/hello"))

    runner.run_compilation(job_id)

    assert repository.get_job(job_id).status == "completed"
    assert "Article body." in output_file(job_id, "md").read_text(encoding="utf-8")


@pytest.mark.parametrize(
    ("item", "target", "value", "reason"),
    [
        (_video(0), "app.jobs.chapters.youtube.load_transcript", None, "No subtitles available."),
        (
            _item(0, "podcast", "https://cdn.example/ep1.mp3"),
            "app.jobs.chapters.load_episode_transcript", None, "Transcription unavailable.",
        ),
        (
            _item(0, "blog", "https://blog.example.com/posts/hello"),
            "app.jobs.chapters.scrape_article",
            Article(url="https://blog.example.com/posts/hello", title="x", content_html=""),
            "No readable content.",
        ),
    ],
)
def test_an_item_with_nothing_to_read_is_skipped_with_its_reason(item, target, value, reason):
    job_id = confirmed_job(item)
    with patch(target, return_value=value):
        runner.run_compilation(job_id)

    job = repository.get_job(job_id)
    assert job.status == "failed"
    assert job.error == NO_USABLE_CONTENT
    assert _outcomes(job_id) == [("i0", "skipped", reason)]


@patch("app.jobs.chapters.youtube.load_transcript")
def test_a_skipped_item_does_not_stop_the_others(load):
    load.side_effect = [None, _transcript()]
    job_id = confirmed_job(_video(0), _video(1))

    runner.run_compilation(job_id)

    assert repository.get_job(job_id).status == "completed"
    assert _outcomes(job_id) == [
        ("i0", "skipped", "No subtitles available."),
        ("i1", "done", None),
    ]


@patch("app.jobs.chapters.youtube.load_transcript")
def test_an_item_that_blows_up_does_not_cost_the_others(load):
    load.side_effect = [RuntimeError("boom"), _transcript()]
    job_id = confirmed_job(_video(0), _video(1))

    runner.run_compilation(job_id)

    assert repository.get_job(job_id).status == "completed"
    assert _outcomes(job_id) == [
        ("i0", "failed", "This item could not be built."),
        ("i1", "done", None),
    ]


@patch("app.jobs.chapters.youtube.load_transcript")
def test_when_every_item_crashes_the_job_says_so_rather_than_blame_the_content(load):
    load.side_effect = RuntimeError("boom")
    job_id = confirmed_job(_video(0), _video(1))

    runner.run_compilation(job_id)

    assert repository.get_job(job_id).error == runner.NOTHING_BUILT


@patch("app.jobs.chapters.youtube.load_transcript")
def test_a_rate_limited_run_says_youtube_is_busy(load):
    load.side_effect = YouTubeUnavailable("HTTP Error 429")
    job_id = confirmed_job(_video(0))

    runner.run_compilation(job_id)

    job = repository.get_job(job_id)
    assert job.error == runner.YOUTUBE_BUSY
    assert _outcomes(job_id) == [("i0", "failed", runner.YOUTUBE_RATE_LIMITED)]


def test_a_running_item_names_its_stage():
    seen = []

    def load(_vid, _language=None):
        seen.append(repository.get_selected_items(job_id)[0].compile_note)
        return _transcript()

    job_id = confirmed_job(_video(0))
    with patch("app.jobs.chapters.youtube.load_transcript", side_effect=load):
        runner.run_compilation(job_id)

    assert seen == ["Reading the transcript"]
    assert _outcomes(job_id) == [("i0", "done", None)]


def test_stop_builds_the_book_from_the_chapters_ready(fake_pandoc):
    def load(_vid, _language=None):
        repository.request_stop(job_id)
        return _transcript()

    job_id = confirmed_job(_video(0), _video(1))
    with patch("app.jobs.chapters.youtube.load_transcript", side_effect=load) as mock:
        runner.run_compilation(job_id)

    assert mock.call_count == 1
    assert repository.get_job(job_id).status == "completed"
    assert len(fake_pandoc.call_args.args[0].chapters) == 1
    assert _outcomes(job_id)[1] == ("i1", "skipped", runner.STOPPED)


@patch("app.jobs.chapters.youtube.load_transcript")
def test_stop_before_any_chapter_ends_the_compile(load):
    job_id = confirmed_job(_video(0))
    repository.request_stop(job_id)

    runner.run_compilation(job_id)

    load.assert_not_called()
    assert repository.get_job(job_id).error == runner.STOPPED_EMPTY


@patch("app.jobs.runner.llm_endpoint", return_value=Endpoint("https://llm.test", "m"))
@patch("app.jobs.chapters.youtube.load_transcript", return_value=_transcript())
def test_stop_mid_polish_drops_that_item_without_waiting(_load, _llm):
    def clean(*_args, should_stop, **_kwargs):
        repository.request_stop(job_id)
        assert should_stop()
        raise CompileStopped

    job_id = confirmed_job(_video(0), _video(1), roles=["punctuate"])
    with patch("app.jobs.chapters.clean_transcript", side_effect=clean):
        runner.run_compilation(job_id)

    assert _outcomes(job_id)[0] == ("i0", "skipped", runner.STOPPED)
    assert repository.get_job(job_id).error == runner.STOPPED_EMPTY


@patch("app.jobs.chapters.youtube.load_transcript", return_value=None)
def test_the_preview_says_why_a_video_has_nothing_to_show(_load):
    from app.jobs.preview import build_item_preview

    preview = build_item_preview(_video(0))

    assert not preview.available
    assert "no subtitles" in preview.note


def test_a_paywalled_post_is_skipped_instead_of_compiling_its_teaser():
    from app.sources.blog import Paywalled

    item = _item(0, "blog", "https://news.example/p/paid")
    item.preview_html = "<p>The opening of a paid post, cut&#8230;</p>"
    job_id = confirmed_job(item)
    with patch("app.jobs.chapters.scrape_article", side_effect=Paywalled("paywall")):
        runner.run_compilation(job_id)

    assert _outcomes(job_id) == [("i0", "skipped", "Behind a paywall, only a teaser is public.")]
