from unittest.mock import patch

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


@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_youtube_completes(
    mock_selected, mock_fetch, mock_render, mock_update, tmp_path, monkeypatch
):
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_youtube_item()]
    mock_fetch.return_value = Transcript(
        video_id="abc123", language="en",
        segments=[TranscriptSegment(text="hello world", start_s=0.0, duration_s=1.0)],
    )

    runner.run_compilation("job1")

    mock_render.assert_called_once()
    assert mock_update.call_args.args[1] == "completed"


@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.scrape_article")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_blog_completes(
    mock_selected, mock_scrape, mock_render, mock_update, tmp_path, monkeypatch
):
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_blog_item()]
    mock_scrape.return_value = Article(
        url="https://blog.example.com/posts/hello", title="An article",
        author="Bob", content_html="<p>Article body.</p>",
    )

    runner.run_compilation("job1")

    mock_render.assert_called_once()
    assert mock_update.call_args.args[1] == "completed"


@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_fails_when_no_subtitles(
    mock_selected, mock_fetch, mock_render, mock_update, tmp_path, monkeypatch
):
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_youtube_item()]
    mock_fetch.return_value = None  # no native subtitles, no fallback

    runner.run_compilation("job1")

    mock_render.assert_not_called()
    assert mock_update.call_args.args[1] == "failed"


@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_reports_youtube_rate_limit(
    mock_selected, mock_fetch, mock_render, mock_update, tmp_path, monkeypatch
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
