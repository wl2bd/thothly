from unittest.mock import patch

import pytest

from app.sources.models import Article, SourceSpec
from app.sources.youtube import video_id
from app.sources import discovery
from app.sources.blog import FeedUnavailable
from app.sources.models import VideoMeta


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
        # Shorts, lives and embeds are single videos, never an article to scrape.
        ("https://www.youtube.com/shorts/abc123XYZ", "youtube_video"),
        ("https://youtube.com/live/abc123XYZ?si=x", "youtube_video"),
        ("https://www.youtube.com/embed/abc123XYZ", "youtube_video"),
        ("https://m.youtube.com/watch?v=abc123", "youtube_video"),
        ("https://blog.example.com", "blog"),
        ("https://hnrss.org/frontpage", "blog"),
    ],
)
def test_detect_kind(url, expected):
    assert discovery.detect_kind(url) == expected


@pytest.mark.parametrize("url", [
    "https://www.youtube.com/shorts/abc123XYZ",
    "https://youtube.com/live/abc123XYZ?si=x",
    "https://www.youtube.com/embed/abc123XYZ",
    "https://youtu.be/abc123XYZ?t=30",
    "https://www.youtube.com/watch?v=abc123XYZ&list=PL1",
])
def test_every_video_url_shape_names_one_video(url):
    assert video_id(url) == "abc123XYZ"


@patch("app.sources.discovery.load_transcript", return_value=None)
@patch("app.sources.discovery.list_videos")
def test_discover_playlist_maps_videos(mock_list, mock_load):
    mock_list.return_value = (
        "Ma Playlist",
        [VideoMeta(id="a", title="A", url="https://www.youtube.com/watch?v=a", duration_s=60)],
    )
    name, items = discovery.discover_source(SourceSpec(url="https://www.youtube.com/playlist?list=x"), 0)
    assert name == "Ma Playlist"
    assert len(items) == 1
    assert items[0].item_type == "youtube"
    assert items[0].estimated_duration_s == 60
    assert items[0].has_transcript is False  # enrichment ran, no subtitles


@patch("app.sources.discovery.list_videos")
def test_discover_channel_normalizes_to_videos_tab(mock_list):
    mock_list.return_value = (None, [])
    discovery.discover_source(SourceSpec(url="https://www.youtube.com/@veritasium"), 0)
    mock_list.assert_called_once_with("https://www.youtube.com/@veritasium/videos")


@patch("app.sources.discovery.load_transcript", return_value=None)
@patch("app.sources.discovery.fetch_video_meta")
def test_discover_single_video(mock_meta, mock_load):
    mock_meta.return_value = VideoMeta(
        id="abc123", title="My Video",
        url="https://www.youtube.com/watch?v=abc123", duration_s=120,
    )
    name, items = discovery.discover_source(SourceSpec(url="https://www.youtube.com/watch?v=abc123"), 0)
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
    name, items = discovery.discover_source(SourceSpec(url="https://b.com/feed"), 1)
    assert name == "Example Blog"
    assert items[0].item_type == "blog"
    assert items[0].source_index == 1
    assert items[0].estimated_size_chars == len("<p>hi</p>")


@patch("app.sources.discovery.fetch_page")
def test_discover_blog_article_url_returns_single_item(mock_fetch):
    # A directly-pasted article URL must yield just that article — not the
    # whole site or the page's next/previous/nav links.
    mock_fetch.return_value = (
        "<html><head><title>My Great Article</title></head>"
        "<body><a href='/next-article-here'>Next</a></body></html>"
    )
    name, items = discovery.discover_source(SourceSpec(url="https://blog.example.com/2024/01/my-great-article"), 0)
    assert len(items) == 1
    assert items[0].url == "https://blog.example.com/2024/01/my-great-article"
    assert items[0].title == "My Great Article"


@patch("app.sources.discovery.fetch_page")
@patch("app.sources.discovery.list_feed")
def test_discover_blog_scrapes_homepage_when_no_feed(mock_feed, mock_fetch):
    mock_feed.side_effect = FeedUnavailable("no feed")
    mock_fetch.return_value = (
        '<html><head><title>My Site</title></head><body>'
        '<a href="/2024/01/great-article">Great Article</a>'
        '<a href="/about">About</a>'
        '</body></html>'
    )
    name, items = discovery.discover_source(SourceSpec(url="https://blog.example.com"), 0)
    assert name == "My Site"  # homepage <title> seeds the book title
    assert len(items) == 1
    assert items[0].url == "https://blog.example.com/2024/01/great-article"
    assert items[0].title == "Great Article"


@patch("app.sources.discovery.fetch_page")
@patch("app.sources.discovery.list_feed")
def test_discover_blog_follows_the_feed_the_page_declares(mock_feed, mock_fetch):
    # A /fr/ page declares /fr/index.xml; guessing paths at the host root
    # found /index.xml first and returned the English posts for the French page.
    feeds = {
        "https://blog.example.com/fr/index.xml": ("Blog FR", [Article(url="https://blog.example.com/fr/p", title="Article FR", content_html="")]),
        "https://blog.example.com/index.xml": ("Blog EN", [Article(url="https://blog.example.com/p", title="Post EN", content_html="")]),
    }

    def feed(url):
        if url not in feeds:
            raise FeedUnavailable(url)
        return feeds[url]

    mock_feed.side_effect = feed
    mock_fetch.return_value = (
        '<html><head><link rel="alternate" type="application/rss+xml" href="/fr/index.xml">'
        "</head><body></body></html>"
    )
    name, items = discovery.discover_source(SourceSpec(url="https://blog.example.com/fr/"), 0)
    assert name == "Blog FR"
    assert [i.title for i in items] == ["Article FR"]


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


@patch("app.sources.discovery.list_feed")
def test_discover_podcast_feed_lists_episodes_as_audio(mock_feed):
    # A pasted podcast RSS feed has no audio extension, so it goes down the blog
    # path; its entries carry audio enclosures and must become podcast items
    # (transcribed), not episode web pages to scrape.
    mock_feed.return_value = (
        "Example Show",
        [
            Article(url="https://show.example.com/ep-1", title="Ep 1", content_html="<p>notes</p>",
                    audio_url="https://cdn.example.com/ep1.mp3", duration_s=1800),
            Article(url="https://show.example.com/ep-2", title="Ep 2", content_html="",
                    audio_url="https://cdn.example.com/ep2.mp3"),
        ],
    )
    name, items = discovery.discover_source(SourceSpec(url="https://feeds.example.com/abc123"), 0)
    assert name == "Example Show"
    assert [i.item_type for i in items] == ["podcast", "podcast"]
    assert items[0].url == "https://cdn.example.com/ep1.mp3"
    assert items[0].title == "Ep 1"
    assert items[0].estimated_duration_s == 1800
    assert items[1].item_index == 1


# --- Homepage link extraction: drop page furniture, flag in-prose links -------

_BASE = "https://blog.example.com/"


def _links(body: str) -> dict[str, bool]:
    """url path -> uncertain, for the links kept from a homepage body."""
    html = f"<html><body>{body}</body></html>"
    return {
        url.removeprefix(_BASE.rstrip("/")): uncertain
        for url, _title, uncertain in discovery._extract_article_links(html, _BASE)
    }


def test_links_in_page_furniture_are_dropped():
    links = _links(
        '<nav><a href="/2024/01/nav-post">Nav post</a></nav>'
        '<header><a href="/2024/01/header-post">Header post</a></header>'
        '<aside><a href="/2024/01/aside-post">Aside post</a></aside>'
        '<footer><a href="/2024/01/footer-post">Footer post</a></footer>'
        '<div role="navigation"><a href="/2024/01/role-nav">Role nav</a></div>'
        '<ol class="references"><li><a href="/2024/01/ref-post">Ref post</a></li></ol>'
        '<main><h2><a href="/2024/01/real-post">Real post</a></h2></main>'
    )
    assert links == {"/2024/01/real-post": False}


def test_links_without_letters_are_dropped():
    # ISBNs and bare numbers are citations, not articles.
    links = _links(
        '<li><a href="/wiki/book-sources-9781400822447">978-1400822447</a></li>'
        '<li><a href="/posts/0-521-25028-5">0-521-25028-5</a></li>'
        '<li><a href="/posts/a-real-title">A real title</a></li>'
    )
    assert links == {"/posts/a-real-title": False}


def test_wiki_namespace_pages_are_dropped():
    links = _links(
        '<li><a href="/wiki/Special:BookSources/some-thing">Book sources here</a></li>'
        '<li><a href="/wiki/Category:Stoic-philosophers">Stoic philosophers</a></li>'
        '<li><a href="/posts/kept-post">Kept post</a></li>'
    )
    assert links == {"/posts/kept-post": False}


def test_a_link_to_the_page_itself_is_dropped():
    links = _links('<li><a href="/">Home of the blog</a></li>'
                   '<li><a href="/posts/kept-post">Kept post</a></li>')
    assert links == {"/posts/kept-post": False}


def test_links_in_running_prose_are_uncertain():
    links = _links(
        '<p>Stoics valued <a href="/posts/self-control">self-control</a> above all.</p>'
        '<blockquote><a href="/posts/quoted-thing">Quoted thing</a></blockquote>'
        '<ul><li><a href="/posts/listed-post">Listed post</a></li></ul>'
    )
    assert links == {
        "/posts/self-control": True,
        "/posts/quoted-thing": True,
        "/posts/listed-post": False,
    }


def test_confident_links_come_before_uncertain_ones():
    html = (
        "<html><body>"
        '<p><a href="/posts/inline-one">Inline one</a></p>'
        '<h2><a href="/posts/listed-one">Listed one</a></h2>'
        "</body></html>"
    )
    links = discovery._extract_article_links(html, _BASE)
    assert [u for u, _t, unc in links] == [
        "https://blog.example.com/posts/listed-one",
        "https://blog.example.com/posts/inline-one",
    ]


@patch("app.sources.discovery.fetch_page")
@patch("app.sources.discovery.list_feed")
def test_discover_blog_marks_in_prose_links_uncertain(mock_feed, mock_fetch):
    mock_feed.side_effect = FeedUnavailable("no feed")
    mock_fetch.return_value = (
        "<html><body>"
        '<h2><a href="/2024/01/great-article">Great Article</a></h2>'
        '<p>See <a href="/2024/01/aside-mention">aside mention</a>.</p>'
        "</body></html>"
    )
    _name, items = discovery.discover_source(SourceSpec(url="https://blog.example.com"), 0)
    assert [(i.title, i.uncertain) for i in items] == [
        ("Great Article", False),
        ("aside mention", True),
    ]


@patch("app.sources.discovery.list_feed")
@patch("app.sources.discovery.fetch_page", return_value="<title>Mechanical Design Engineer</title>")
def test_a_deep_page_picked_from_search_is_that_page_not_its_site(_fetch, mock_feed):
    url = "https://careers.example.com/job/berkeley/design-engineer/185/1029"
    name, items = discovery.discover_source(SourceSpec(url=url, query="q"), 0)
    assert name == "Mechanical Design Engineer"
    assert [i.url for i in items] == [url]
    mock_feed.assert_not_called()


_ARTICLE = (
    "<html><head><title>The piece | The Magazine</title>"
    '<meta property="og:title" content="The piece"></head><body><article><h1>The piece</h1>'
    + "<p>" + "A sentence that makes this page an article. " * 40 + "</p>"
    + "</article></body></html>"
)


@patch("app.sources.discovery.fetch_page", return_value=None)
def test_a_page_that_wont_load_is_unreadable_and_keeps_the_search_title(_fetch):
    url = "https://news.example.com/region/lidentite-etait-le-theme-du-debat-1706096"
    _, [item] = discovery.discover_source(SourceSpec(url=url, query="q", title="L’identité était le thème"), 0)
    assert item.unreadable
    assert item.title == "L’identité était le thème"


@patch("app.sources.discovery.fetch_page", return_value=None)
def test_a_title_made_from_the_url_drops_its_numeric_id(_fetch):
    url = "https://news.example.com/region/lidentite-etait-le-theme-du-debat-1706096.html"
    _, [item] = discovery.discover_source(SourceSpec(url=url, query="q"), 0)
    assert item.title == "Lidentite Etait Le Theme Du Debat"


@patch("app.sources.blog.fetch_page")
@patch("app.sources.discovery.fetch_page", return_value=_ARTICLE)
def test_a_readable_page_is_titled_from_the_article(_fetch, blog_fetch):
    url = "https://mag.example.com/articles/the-piece/11553"
    _, [item] = discovery.discover_source(SourceSpec(url=url, query="q", title="The piece | The Magazine"), 0)
    assert not item.unreadable and not item.paywalled
    assert item.title == "The piece"
    blog_fetch.assert_not_called()  # the page discovery loaded is the one read


@patch("app.sources.discovery.fetch_page")
def test_a_paid_page_is_flagged_at_discovery(fetch):
    fetch.return_value = _ARTICLE.replace("<article>", '<article><div class="paywall">')
    _, [item] = discovery.discover_source(SourceSpec(url="https://mag.example.com/a/b-c", query="q"), 0)
    assert item.paywalled


@patch("app.sources.discovery.fetch_page", return_value="<html><body><nav>Menu</nav></body></html>")
def test_a_page_with_no_text_is_unreadable(_fetch):
    _, [item] = discovery.discover_source(SourceSpec(url="https://mag.example.com/a/b-c", query="q"), 0)
    assert item.unreadable


@patch("app.sources.discovery.list_feed")
def test_a_site_home_picked_from_search_still_unfolds(mock_feed):
    mock_feed.return_value = ("A blog", [
        Article(url="https://blog.example.com/fr/a", title="A", content_html="<p>a</p>"),
        Article(url="https://blog.example.com/fr/b", title="B", content_html="<p>b</p>"),
    ])
    name, items = discovery.discover_source(SourceSpec(url="https://blog.example.com/fr/", query="q"), 0)
    assert name == "A blog"
    assert len(items) == 2


def test_pasted_urls_read_as_the_frontend_reads_them():
    import json
    from pathlib import Path

    cases = json.loads((Path(__file__).parents[2] / "fixtures" / "url-kinds.json").read_text("utf-8"))
    for url, kind in cases["cases"]:
        assert discovery.detect_kind(url) == kind, url


def test_a_paywalled_feed_article_is_flagged_for_review():
    article = Article(url="https://news.example/p/paid", title="Paid", content_html="<p>…</p>", paywalled=True)
    assert discovery._article_to_item(article, 0, 0, "https://news.example/feed").paywalled is True
