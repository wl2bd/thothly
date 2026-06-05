from unittest.mock import patch

from app.sources import discovery
from app.sources.blog import FeedUnavailable
from app.sources.models import Article, VideoMeta


@patch("app.sources.discovery.list_videos")
def test_discover_youtube_maps_videos(mock_list):
    mock_list.return_value = [
        VideoMeta(id="a", title="A", url="https://www.youtube.com/watch?v=a", duration_s=60),
    ]
    items = discovery.discover_source("youtube_playlist", "https://youtube.com/playlist?list=x", 0)
    assert len(items) == 1
    assert items[0].item_type == "youtube"
    assert items[0].estimated_duration_s == 60
    assert items[0].source_index == 0


@patch("app.sources.discovery.list_feed")
def test_discover_rss_maps_articles(mock_feed):
    mock_feed.return_value = [Article(url="https://b.com/p1", title="P1", content_html="<p>hi</p>")]
    items = discovery.discover_source("blog_rss", "https://b.com/feed", 1)
    assert items[0].item_type == "blog"
    assert items[0].source_index == 1
    assert items[0].estimated_size_chars == len("<p>hi</p>")


def test_looks_like_article_accepts_and_rejects():
    base = "https://blog.example.com"
    assert discovery._looks_like_article("https://blog.example.com/2024/01/my-post", base)
    assert discovery._looks_like_article("https://blog.example.com/posts/hello-world", base)
    assert discovery._looks_like_article("https://blog.example.com/some-long-slug-here", base)
    assert not discovery._looks_like_article("https://blog.example.com/about", base)
    assert not discovery._looks_like_article("https://other.com/2024/01/x", base)
    assert not discovery._looks_like_article("https://blog.example.com/logo.png", base)


@patch("app.sources.discovery._fetch_url")
@patch("app.sources.discovery.list_feed")
def test_discover_blog_scrapes_homepage_when_no_rss(mock_feed, mock_fetch):
    mock_feed.side_effect = FeedUnavailable("no feed")
    mock_fetch.return_value = (
        '<html><body>'
        '<a href="/2024/01/great-article">Great Article</a>'
        '<a href="/about">About</a>'
        '</body></html>'
    )
    items = discovery.discover_source("blog_url", "https://blog.example.com", 0)
    assert len(items) == 1
    assert items[0].url == "https://blog.example.com/2024/01/great-article"
    assert items[0].title == "Great Article"


def test_unknown_source_type_returns_empty():
    assert discovery.discover_source("mystery", "https://x.com", 0) == []
