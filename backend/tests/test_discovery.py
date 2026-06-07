from unittest.mock import patch

import pytest

from app.sources import discovery
from app.sources.blog import FeedUnavailable
from app.sources.models import Article, VideoMeta


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://www.youtube.com/watch?v=abc123", "youtube_video"),
        ("https://youtu.be/abc123", "youtube_video"),
        ("https://www.youtube.com/playlist?list=PL123", "youtube_playlist"),
        # An explicit video id wins over a playlist context.
        ("https://www.youtube.com/watch?v=abc&list=PL123", "youtube_video"),
        ("https://youtu.be/8XFMRd34fKk?list=PL0LLIK", "youtube_video"),
        ("https://www.youtube.com/@veritasium", "youtube_channel"),
        ("https://www.youtube.com/channel/UC123", "youtube_channel"),
        ("https://blog.example.com", "blog"),
        ("https://hnrss.org/frontpage", "blog"),
    ],
)
def test_detect_kind(url, expected):
    assert discovery.detect_kind(url) == expected


@patch("app.sources.discovery.load_transcript", return_value=None)
@patch("app.sources.discovery.list_videos")
def test_discover_playlist_maps_videos(mock_list, mock_load):
    mock_list.return_value = (
        "Ma Playlist",
        [VideoMeta(id="a", title="A", url="https://www.youtube.com/watch?v=a", duration_s=60)],
    )
    name, items = discovery.discover_source("https://www.youtube.com/playlist?list=x", 0)
    assert name == "Ma Playlist"
    assert len(items) == 1
    assert items[0].item_type == "youtube"
    assert items[0].estimated_duration_s == 60
    assert items[0].has_transcript is False  # enrichment ran, no subtitles


@patch("app.sources.discovery.list_videos")
def test_discover_channel_normalizes_to_videos_tab(mock_list):
    mock_list.return_value = (None, [])
    discovery.discover_source("https://www.youtube.com/@veritasium", 0)
    mock_list.assert_called_once_with("https://www.youtube.com/@veritasium/videos")


@patch("app.sources.discovery.load_transcript", return_value=None)
@patch("app.sources.discovery.fetch_video_meta")
def test_discover_single_video(mock_meta, mock_load):
    mock_meta.return_value = VideoMeta(
        id="abc123", title="My Video",
        url="https://www.youtube.com/watch?v=abc123", duration_s=120,
    )
    name, items = discovery.discover_source("https://www.youtube.com/watch?v=abc123", 0)
    assert name == "My Video"  # single video -> its title seeds the book title
    assert len(items) == 1
    assert items[0].title == "My Video"
    assert items[0].item_type == "youtube"


@patch("app.sources.discovery.list_feed")
def test_discover_blog_uses_url_as_feed(mock_feed):
    mock_feed.return_value = (
        "Example Blog",
        [Article(url="https://b.com/p1", title="P1", content_html="<p>hi</p>")],
    )
    name, items = discovery.discover_source("https://b.com/feed", 1)
    assert name == "Example Blog"
    assert items[0].item_type == "blog"
    assert items[0].source_index == 1
    assert items[0].estimated_size_chars == len("<p>hi</p>")


@patch("app.sources.discovery._fetch_url")
@patch("app.sources.discovery.list_feed")
def test_discover_blog_scrapes_homepage_when_no_feed(mock_feed, mock_fetch):
    mock_feed.side_effect = FeedUnavailable("no feed")
    mock_fetch.return_value = (
        '<html><head><title>My Site</title></head><body>'
        '<a href="/2024/01/great-article">Great Article</a>'
        '<a href="/about">About</a>'
        '</body></html>'
    )
    name, items = discovery.discover_source("https://blog.example.com", 0)
    assert name == "My Site"  # homepage <title> seeds the book title
    assert len(items) == 1
    assert items[0].url == "https://blog.example.com/2024/01/great-article"
    assert items[0].title == "Great Article"


def test_collapse_repeated_text():
    # responsive-variant duplication (3x) collapses to one copy
    assert discovery._collapse_repeated_text("Title Sub Title Sub Title Sub") == "Title Sub"
    assert discovery._collapse_repeated_text("A B A B") == "A B"
    # non-repeating text is left alone
    assert discovery._collapse_repeated_text("A normal unique title") == "A normal unique title"


def test_looks_like_article_accepts_and_rejects():
    base = "https://blog.example.com"
    assert discovery._looks_like_article("https://blog.example.com/2024/01/my-post", base)
    assert discovery._looks_like_article("https://blog.example.com/posts/hello-world", base)
    assert discovery._looks_like_article("https://blog.example.com/some-long-slug-here", base)
    assert not discovery._looks_like_article("https://blog.example.com/about", base)
    assert not discovery._looks_like_article("https://other.com/2024/01/x", base)
    assert not discovery._looks_like_article("https://blog.example.com/logo.png", base)
