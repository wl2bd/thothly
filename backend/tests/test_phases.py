from unittest.mock import patch

from app.jobs import phases
from app.jobs.models import Source
from app.sources.discovery import DiscoveredItem

SOURCE = Source(url="https://youtube.com/playlist?list=x")


@patch("app.jobs.phases.set_job_sources")
@patch("app.jobs.phases.update_job_status")
@patch("app.jobs.phases.save_discovered_items")
@patch("app.jobs.phases.discover_source")
def test_run_discovery_saves_items_and_moves_to_reviewing(mock_discover, mock_save, mock_update, mock_set_sources):
    mock_discover.return_value = (
        "Ma Playlist",
        [DiscoveredItem(title="A", url="https://www.youtube.com/watch?v=a",
                        item_type="youtube", source_index=0, item_index=0)],
    )
    phases.run_discovery("job1", [SOURCE])

    mock_save.assert_called_once()
    saved_items = mock_save.call_args.args[1]
    assert saved_items[0].id == "job1-0-0"
    assert mock_update.call_args.args[1] == "reviewing"
    # the source name seeds the default book title
    assert mock_update.call_args.kwargs["book_title"] == "Ma Playlist"


@patch("app.jobs.phases.update_job_status")
@patch("app.jobs.phases.save_discovered_items")
@patch("app.jobs.phases.discover_source")
def test_run_discovery_with_no_items_fails(mock_discover, mock_save, mock_update):
    mock_discover.return_value = (None, [])
    phases.run_discovery("job1", [SOURCE])

    mock_save.assert_not_called()
    assert mock_update.call_args.args[1] == "failed"


@patch("app.jobs.phases.update_job_status")
@patch("app.jobs.phases.save_discovered_items")
@patch("app.jobs.phases.discover_source")
def test_run_discovery_handles_source_error(mock_discover, mock_save, mock_update):
    mock_discover.side_effect = RuntimeError("boom")
    phases.run_discovery("job1", [SOURCE])

    assert mock_update.call_args.args[1] == "failed"


@patch("app.jobs.phases.set_job_sources")
@patch("app.jobs.phases.update_job_status")
@patch("app.jobs.phases.save_discovered_items")
@patch("app.jobs.phases.discover_source")
def test_run_discovery_keeps_a_title_given_at_creation(mock_discover, mock_save, mock_update, mock_set_sources):
    mock_discover.return_value = (
        "Ma Playlist",
        [DiscoveredItem(title="A", url="https://www.youtube.com/watch?v=a",
                        item_type="youtube", source_index=0, item_index=0)],
    )
    phases.run_discovery("job1", [SOURCE], book_title="How transformers work")

    assert mock_update.call_args.kwargs["book_title"] == "How transformers work"


@patch("app.jobs.phases.set_job_sources")
@patch("app.jobs.phases.update_job_status")
@patch("app.jobs.phases.save_discovered_items")
@patch("app.jobs.phases.discover_source")
def test_one_unreadable_source_does_not_fail_the_others(mock_discover, mock_save, mock_update, mock_set_sources):
    ok = ("Good", [DiscoveredItem(title="A", url="https://example.com/a",
                                  item_type="blog", source_index=1, item_index=0)])
    mock_discover.side_effect = [RuntimeError("403"), ok]
    sources = [Source(url="https://blocked.example/x"), Source(url="https://example.com/a")]
    phases.run_discovery("job1", sources)

    assert mock_update.call_args.args[1] == "reviewing"
    assert len(mock_save.call_args.args[1]) == 1
    written = mock_set_sources.call_args.args[1]
    assert written[0].resolved and written[0].item_count == 0
    assert written[0].error
    assert written[1].error is None
