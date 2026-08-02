from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.jobs import runner
from app.jobs.models import DiscoveredItemResponse
from app.sources.models import Article, Transcript, TranscriptSegment


def _youtube_item() -> DiscoveredItemResponse:
    return DiscoveredItemResponse(
        id="j-0-0", source_index=0, item_index=0, item_type="youtube",
        title="A video", url="https://www.youtube.com/watch?v=abc123",
    )


def _blog_item() -> DiscoveredItemResponse:
    return DiscoveredItemResponse(
        id="j-1-0", source_index=1, item_index=0, item_type="blog",
        title="An article", url="https://blog.example.com/posts/hello",
    )


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.get_job")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_youtube_completes(
    mock_selected, mock_fetch, mock_render, mock_update, mock_job, mock_state, tmp_path, monkeypatch
):
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_youtube_item()]
    mock_job.return_value = SimpleNamespace(book_title="My Book")
    mock_fetch.return_value = Transcript(
        video_id="abc123", language="en",
        segments=[TranscriptSegment(text="hello world", start_s=0.0, duration_s=1.0)],
    )

    runner.run_compilation("job1")

    mock_render.assert_called_once()
    assert mock_update.call_args.args[1] == "completed"


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.get_job")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_writes_markdown_companion(
    mock_selected, mock_fetch, mock_render, mock_update, mock_job, mock_state, tmp_path, monkeypatch
):
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_youtube_item()]
    mock_job.return_value = SimpleNamespace(book_title="My Book")
    mock_fetch.return_value = Transcript(
        video_id="abc123", language="en",
        segments=[TranscriptSegment(text="hello world", start_s=0.0, duration_s=1.0)],
    )

    runner.run_compilation("job1")

    # A standalone .md twin is written next to the EPUB and its path is recorded.
    md_path = tmp_path / "output" / "job1.md"
    assert md_path.exists()
    assert "hello world" in md_path.read_text(encoding="utf-8")
    assert mock_update.call_args.kwargs["output_md_path"] == str(md_path)


def _podcast_item() -> DiscoveredItemResponse:
    return DiscoveredItemResponse(
        id="j-2-0", source_index=2, item_index=0, item_type="podcast",
        title="Episode 1", url="https://cdn.example/ep1.mp3",
    )


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.get_job")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_episode_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_podcast_completes(
    mock_selected, mock_tx, mock_render, mock_update, mock_job, mock_state, tmp_path, monkeypatch
):
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_podcast_item()]
    mock_job.return_value = SimpleNamespace(book_title="My Book")
    mock_tx.return_value = Transcript(
        video_id="https://cdn.example/ep1.mp3", language="",
        segments=[TranscriptSegment(text="Welcome to the show.", start_s=0.0, duration_s=1.0)],
    )

    runner.run_compilation("job1")

    mock_render.assert_called_once()
    assert mock_update.call_args.args[1] == "completed"


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_episode_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_skips_podcast_without_transcript(
    mock_selected, mock_tx, mock_render, mock_update, mock_state, tmp_path, monkeypatch
):
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_podcast_item()]
    mock_tx.return_value = None  # no STT configured / transcription failed

    runner.run_compilation("job1")

    mock_render.assert_not_called()
    assert mock_update.call_args.args[1] == "failed"  # no usable content


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.get_job")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.scrape_article")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_blog_completes(
    mock_selected, mock_scrape, mock_render, mock_update, mock_job, mock_state, tmp_path, monkeypatch
):
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_blog_item()]
    mock_job.return_value = SimpleNamespace(book_title="My Book")
    mock_scrape.return_value = Article(
        url="https://blog.example.com/posts/hello", title="An article",
        author="Bob", content_html="<p>Article body.</p>",
    )

    runner.run_compilation("job1")

    mock_render.assert_called_once()
    assert mock_update.call_args.args[1] == "completed"


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.get_job")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_fails_when_no_subtitles(
    mock_selected, mock_fetch, mock_render, mock_update, mock_job, mock_state,
    tmp_path, monkeypatch,
):
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_youtube_item()]
    mock_job.return_value = SimpleNamespace(book_title="My Book")
    mock_fetch.return_value = None  # no native subtitles, no fallback

    runner.run_compilation("job1")

    mock_render.assert_not_called()
    assert mock_update.call_args.args[1] == "failed"
    # Pinned against test_run_compilation_fails_when_every_item_crashes below:
    # a genuinely empty item (nothing to build from) gets compile_book's content
    # message, never the crash-specific NOTHING_BUILT.
    assert (
        mock_update.call_args.kwargs["error"]
        == "The selected items had no usable content. Check that the videos have "
        "subtitles and the articles have readable text."
    )


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_reports_youtube_rate_limit(
    mock_selected, mock_fetch, mock_render, mock_update, mock_state, tmp_path, monkeypatch
):
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    from app.sources.youtube import YouTubeUnavailable

    mock_selected.return_value = [_youtube_item()]
    mock_fetch.side_effect = YouTubeUnavailable("HTTP Error 429: Too Many Requests")

    runner.run_compilation("job1")

    mock_render.assert_not_called()
    assert mock_update.call_args.args[1] == "failed"
    assert "rate-limiting" in mock_update.call_args.kwargs["error"]


def test_extract_video_id():
    assert runner._extract_video_id("https://www.youtube.com/watch?v=abc123") == "abc123"
    assert runner._extract_video_id("https://youtu.be/xyz789") == "xyz789"


def test_extract_video_id_trailing_slash():
    assert runner._extract_video_id("https://youtu.be/xyz789/") == "xyz789"


@patch("app.jobs.runner.load_transcript")
def test_youtube_chapter_skips_with_a_reason_when_there_are_no_subtitles(mock_load):
    """The reason a video didn't make it has to leave the log: it's what the
    compile screen shows next to the item."""
    mock_load.return_value = None
    with pytest.raises(runner.ItemSkipped) as excinfo:
        runner._youtube_chapter(_youtube_item(), "job1", [], "")
    assert str(excinfo.value) == "No subtitles available."


@patch("app.jobs.runner.load_episode_transcript")
def test_podcast_chapter_skips_with_a_reason_when_transcription_is_unavailable(mock_load):
    mock_load.return_value = None
    with pytest.raises(runner.ItemSkipped) as excinfo:
        runner._podcast_chapter(_podcast_item(), "job1", [], "")
    assert str(excinfo.value) == "Transcription unavailable."


@patch("app.jobs.runner.scrape_article")
def test_blog_chapter_skips_with_a_reason_when_the_page_has_no_text(mock_scrape):
    mock_scrape.return_value = Article(
        url="https://blog.example.com/posts/hello", title="An article",
        content_html="", author=None, published_at=None,
    )
    with pytest.raises(runner.ItemSkipped) as excinfo:
        runner._blog_chapter(_blog_item(), "job1", [], "")
    assert str(excinfo.value) == "No readable content."


def _states(mock_state):
    """The (item_id, state, note) triples the runner wrote, in order.

    `note` falls back to the keyword form: set_item_compile_state's fourth
    argument is positional in every current call site, but if a future call ever
    passed `note=` instead, reading only `c.args[3]` would silently see None and
    the assertions below would keep passing while checking nothing.
    """
    return [
        (
            c.args[1],
            c.args[2],
            c.args[3] if len(c.args) > 3 else c.kwargs.get("note"),
        )
        for c in mock_state.call_args_list
    ]


def _second_youtube_item() -> DiscoveredItemResponse:
    return DiscoveredItemResponse(
        id="j-0-1", source_index=0, item_index=1, item_type="youtube",
        title="Another video", url="https://www.youtube.com/watch?v=def456",
    )


def _transcript(video_id: str) -> Transcript:
    return Transcript(
        video_id=video_id, language="en",
        segments=[TranscriptSegment(text="hello world", start_s=0.0, duration_s=1.0)],
    )


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.get_job")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_records_each_item_and_skips_without_stopping(
    mock_selected, mock_fetch, mock_render, mock_update, mock_job, mock_state,
    tmp_path, monkeypatch,
):
    """An item with nothing to compile is recorded with its reason and stepped
    over. The rest of the compilation is not the user's to lose."""
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_youtube_item(), _second_youtube_item()]
    mock_job.return_value = SimpleNamespace(book_title="My Book")
    mock_fetch.side_effect = [None, _transcript("def456")]

    runner.run_compilation("job1")

    assert mock_update.call_args.args[1] == "completed"
    assert _states(mock_state) == [
        ("j-0-0", "compiling", None),
        ("j-0-0", "skipped", "No subtitles available."),
        ("j-0-1", "compiling", None),
        ("j-0-1", "done", None),
    ]


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.get_job")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_survives_an_item_that_blows_up(
    mock_selected, mock_fetch, mock_render, mock_update, mock_job, mock_state,
    tmp_path, monkeypatch,
):
    """An unexpected crash on one item used to fail the whole job, losing every
    other item and offering a retry that would do exactly the same thing."""
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_youtube_item(), _second_youtube_item()]
    mock_job.return_value = SimpleNamespace(book_title="My Book")
    mock_fetch.side_effect = [RuntimeError("boom"), _transcript("def456")]

    runner.run_compilation("job1")

    assert mock_update.call_args.args[1] == "completed"
    assert _states(mock_state) == [
        ("j-0-0", "compiling", None),
        ("j-0-0", "failed", "This item could not be built."),
        ("j-0-1", "compiling", None),
        ("j-0-1", "done", None),
    ]


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.get_job")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_fails_when_no_item_survives(
    mock_selected, mock_fetch, mock_render, mock_update, mock_job, mock_state,
    tmp_path, monkeypatch,
):
    """The guard rail: tolerating bad items must not produce an empty book."""
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_youtube_item(), _second_youtube_item()]
    mock_job.return_value = SimpleNamespace(book_title="My Book")
    mock_fetch.return_value = None

    runner.run_compilation("job1")

    assert mock_update.call_args.args[1] == "failed"
    mock_render.assert_not_called()
    # Both items still carry their reason. get_job now exposes the confirmed
    # items for a `failed` job too (not just processing/completed), and the
    # failed screen renders them via CompileStep, so this failure screen isn't
    # blank: it lists exactly what the compile screen showed a moment ago.
    assert _states(mock_state) == [
        ("j-0-0", "compiling", None),
        ("j-0-0", "skipped", "No subtitles available."),
        ("j-0-1", "compiling", None),
        ("j-0-1", "skipped", "No subtitles available."),
    ]
    # No item crashed, so this is compile_book's own message, not NOTHING_BUILT
    # — pinned apart from test_run_compilation_fails_when_every_item_crashes below.
    assert (
        mock_update.call_args.kwargs["error"]
        == "The selected items had no usable content. Check that the videos have "
        "subtitles and the articles have readable text."
    )


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_fails_when_every_item_crashes(
    mock_selected, mock_fetch, mock_render, mock_update, mock_state,
    tmp_path, monkeypatch,
):
    """Distinct from test_run_compilation_fails_when_no_item_survives above: here
    nothing was actually missing, every item raised. Before this guard, an
    all-crash run fell through to compile_book's "no usable content" message and
    sent the user to check subtitles when nothing was wrong with the content."""
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_youtube_item(), _second_youtube_item()]
    mock_fetch.side_effect = [RuntimeError("boom"), RuntimeError("boom again")]

    runner.run_compilation("job1")

    assert mock_update.call_args.args[1] == "failed"
    mock_render.assert_not_called()
    assert mock_update.call_args.kwargs["error"] == runner.NOTHING_BUILT
    assert _states(mock_state) == [
        ("j-0-0", "compiling", None),
        ("j-0-0", "failed", "This item could not be built."),
        ("j-0-1", "compiling", None),
        ("j-0-1", "failed", "This item could not be built."),
    ]
