from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.pipeline.compiler import html_to_markdown
from app.sources.models import Article
from app.sources.blog import (
    FeedUnavailable,
    _clean_extracted_html,
    _unwrap_image_links,
    list_feed,
    scrape_article,
)


def test_clean_extracted_html_converts_trafilatura_table():
    html = (
        "<table><row><cell role='head'><p>Pitfall</p></cell>"
        "<cell role='head'><p>Mitigation</p></cell></row>"
        "<row><cell><p>Hype</p></cell><cell><p>Ship milestones</p></cell></row></table>"
    )
    md = html_to_markdown(_clean_extracted_html(html, "https://x.test/post"))
    lines = [l for l in md.splitlines() if l.strip().startswith("|")]
    assert len(lines) == 3  # header, separator, one data row
    assert "| Pitfall | Mitigation |" in md
    assert "| Hype | Ship milestones |" in md


def test_clean_extracted_html_collapses_line_number_code_table():
    # A Chroma/Hugo lntable: gutter <pre> of line numbers + a code <pre>.
    html = (
        "<row><cell class='lntd'><pre>1\n2\n3</pre></cell>"
        "<cell class='lntd'><pre>def f():\n    return 1</pre></cell></row>"
    )
    md = html_to_markdown(_clean_extracted_html(html, "https://x.test/post"))
    assert "def f():" in md
    assert "return 1" in md
    assert "| 1 2 3" not in md  # the line-number gutter is gone
    assert not any(l.strip().startswith("|") for l in md.splitlines())  # no table


def test_clean_extracted_html_drops_empty_code_blocks():
    html = "<p>Texte</p><pre><code></code></pre><p><code>kept</code></p>"
    cleaned = _clean_extracted_html(html, "https://x.test/post")
    assert "kept" in cleaned
    assert "<pre>" not in cleaned  # empty code block removed


def test_clean_extracted_html_passes_standard_html_through():
    html = "<p>Rien a nettoyer</p>"
    assert _clean_extracted_html(html, "https://x.test/post") == html


def test_clean_extracted_html_converts_graphic_to_image():
    # trafilatura emits images as <graphic>, doubled for linked images: once
    # protocol-relative inside the <a>, once bare. Both must collapse to one
    # <img> that markdownify renders, with an absolute URL.
    html = (
        '<a href="https://x.test/file"><graphic src="//cdn.test/fig.png"/></a>'
        '<graphic src="http://cdn.test/fig.png"/>'
    )
    cleaned = _clean_extracted_html(html, "https://x.test/post/")
    assert cleaned.count("<img") == 1  # the duplicate is dropped
    md = html_to_markdown(cleaned)
    assert "![](https://cdn.test/fig.png)" in md or "(https://cdn.test/fig.png)" in md


def test_unwrap_image_links_removes_image_only_anchors():
    # Substack-style "click to enlarge" wrapper: trafilatura would prune the
    # whole figure as a high-link-density block, losing the image.
    html = '<figure><a href="https://x.test/big.png"><img src="https://x.test/fig.png"/></a></figure>'
    out = _unwrap_image_links(html)
    assert "<a" not in out  # the wrapping anchor is gone
    assert '<img src="https://x.test/fig.png"' in out  # the image survives


def test_unwrap_image_links_keeps_text_links_intact():
    # A genuine text link must not be de-linked, even if it carries an icon.
    html = '<p><a href="https://x.test/page"><img src="i.png"/> Read more</a></p>'
    out = _unwrap_image_links(html)
    assert '<a href="https://x.test/page"' in out  # link preserved


def test_clean_extracted_html_absolutizes_relative_image():
    # trafilatura often leaves <img src> site-root-relative; left alone the
    # renderer treats it as a local file and drops it. Resolve against the page.
    html = '<p>x</p><img src="/post/./fig.jpg" alt="a"/>'
    cleaned = _clean_extracted_html(html, "https://x.test/post/")
    assert 'src="https://x.test/post/fig.jpg"' in cleaned

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
