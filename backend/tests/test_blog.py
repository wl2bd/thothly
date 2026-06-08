from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.pipeline.compiler import html_to_markdown
from app.sources.models import Article
from app.sources.blog import FeedUnavailable, list_feed, scrape_article

_ARTICLE_HTML = """<html><head><title>Test</title></head><body><article>
<h1>Un titre d'article</h1>
<p>Voici un paragraphe avec du texte en <strong>gras important</strong> et aussi
de l'<em>italique subtil</em> pour appuyer le propos sur plusieurs mots ici.</p>
<p>Un second paragraphe qui contient un <a href="https://example.com/page">lien
vers une ressource</a> externe, et encore du contenu pour que trafilatura
considère ceci comme un vrai article à extraire correctement.</p>
<p>Un troisième paragraphe de remplissage avec assez de texte pour dépasser le
seuil de densité de trafilatura et garantir une extraction stable du corps.</p>
</article></body></html>"""


def _make_content_item(value: str) -> SimpleNamespace:
    return SimpleNamespace(value=value, type="text/html")


def _make_entry(
    link: str = "https://example.com/article-1",
    title: str = "Article 1",
    published_parsed=None,
    author: str | None = None,
    content: list | None = None,
    summary: str | None = None,
) -> SimpleNamespace:
    entry = SimpleNamespace(
        link=link,
        title=title,
        published_parsed=published_parsed,
        author=author,
        content=content or [],
        summary=summary,
    )
    return entry


def _make_feed_result(entries: list, status: int = 200, title: str | None = None) -> SimpleNamespace:
    feed = {"title": title} if title is not None else {}
    return SimpleNamespace(entries=entries, status=status, feed=feed)


@patch("app.sources.blog.feedparser.parse")
def test_list_feed_returns_feed_title(mock_parse):
    mock_parse.return_value = _make_feed_result([_make_entry()], title="My Blog")
    title, _articles = list_feed("https://blog.example.com/feed.xml")
    assert title == "My Blog"


# ── list_feed ────────────────────────────────────────────────────────────────

@patch("app.sources.blog.feedparser.parse")
def test_list_feed_returns_articles(mock_parse):
    mock_parse.return_value = _make_feed_result([
        _make_entry(
            link="https://blog.example.com/post-1",
            title="First Post",
            published_parsed=(2024, 3, 15, 10, 0, 0, 4, 75, 0),
            author="Alice",
            content=[_make_content_item("<p>Full article content.</p>")],
        ),
        _make_entry(
            link="https://blog.example.com/post-2",
            title="Second Post",
            summary="<p>Summary only.</p>",
        ),
    ])

    _title, result = list_feed("https://blog.example.com/feed.xml")

    assert len(result) == 2
    assert all(isinstance(a, Article) for a in result)

    first = result[0]
    assert first.url == "https://blog.example.com/post-1"
    assert first.title == "First Post"
    assert first.published_at == datetime(2024, 3, 15, 10, 0, 0)
    assert first.author == "Alice"
    assert first.content_html == "<p>Full article content.</p>"

    second = result[1]
    assert second.content_html == "<p>Summary only.</p>"
    assert second.author is None


@patch("app.sources.blog.feedparser.parse")
def test_list_feed_prefers_content_over_summary(mock_parse):
    entry = _make_entry(
        content=[_make_content_item("<p>Full content.</p>")],
        summary="<p>Summary.</p>",
    )
    mock_parse.return_value = _make_feed_result([entry])

    _title, result = list_feed("https://blog.example.com/feed.xml")

    assert result[0].content_html == "<p>Full content.</p>"


@patch("app.sources.blog.feedparser.parse")
def test_list_feed_falls_back_to_summary(mock_parse):
    entry = _make_entry(content=[], summary="<p>Only a summary.</p>")
    mock_parse.return_value = _make_feed_result([entry])

    _title, result = list_feed("https://blog.example.com/feed.xml")

    assert result[0].content_html == "<p>Only a summary.</p>"


@patch("app.sources.blog.feedparser.parse")
def test_list_feed_empty_content_html_when_no_content(mock_parse):
    entry = _make_entry(content=[], summary=None)
    mock_parse.return_value = _make_feed_result([entry])

    _title, result = list_feed("https://blog.example.com/feed.xml")

    assert result[0].content_html == ""


@patch("app.sources.blog.feedparser.parse")
def test_list_feed_empty_feed(mock_parse):
    mock_parse.return_value = _make_feed_result([])

    _title, result = list_feed("https://blog.example.com/feed.xml")

    assert result == []


@patch("app.sources.blog.feedparser.parse")
def test_list_feed_raises_on_http_error(mock_parse):
    mock_parse.return_value = _make_feed_result([], status=404)

    with pytest.raises(FeedUnavailable):
        list_feed("https://blog.example.com/feed.xml")


@patch("app.sources.blog.feedparser.parse")
def test_list_feed_no_published_date(mock_parse):
    entry = _make_entry(published_parsed=None)
    mock_parse.return_value = _make_feed_result([entry])

    _title, result = list_feed("https://blog.example.com/feed.xml")

    assert result[0].published_at is None


# ── scrape_article (formatting fidelity) ─────────────────────────────────────

@patch("app.sources.blog._fetch_url")
def test_scrape_article_preserves_bold_italic_links(mock_fetch):
    mock_fetch.return_value = _ARTICLE_HTML
    article = scrape_article("https://x.test/article")

    # Inline formatting and links survive trafilatura extraction...
    assert "<strong>" in article.content_html
    assert "<i>" in article.content_html or "<em>" in article.content_html
    assert 'href="https://example.com/page"' in article.content_html

    # ...all the way to the Markdown that feeds Pandoc.
    md = html_to_markdown(article.content_html)
    assert "**gras important**" in md
    assert "*italique subtil*" in md
    assert "[lien\nvers une ressource](https://example.com/page)" in md or (
        "](https://example.com/page)" in md
    )
