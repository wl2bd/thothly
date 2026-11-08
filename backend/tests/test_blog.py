from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.pipeline.html_md import html_to_markdown
from app.sources.models import Article
from app.sources.blog import (
    Paywalled,
    FeedUnavailable,
    _checked_title,
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


def test_clean_extracted_html_unwraps_a_layout_table():
    # paulgraham.com lays the whole essay out in one table cell: read as data,
    # the book got a single giant table row with every paragraph flattened.
    html = (
        "<table><row><cell><graphic/></cell><cell><p/><graphic src='/s.gif' width='26' height='1'/>"
        "</cell></row></table>"
        "<table><row><cell><p>July 2023</p><p>First paragraph.</p>"
        "<p>Second paragraph.</p></cell></row></table>"
    )
    md = html_to_markdown(_clean_extracted_html(html, "https://x.test/post"))
    assert "|" not in md and "s.gif" not in md
    assert "First paragraph.\n\nSecond paragraph." in md


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

@patch("app.sources.blog.fetch_page")
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


def _page(body: str) -> str:
    filler = "<p>" + "A sentence that makes this page an article. " * 40 + "</p>"
    return f"<html><body><article><h1>T</h1>{body}{filler}</article></body></html>"


@patch("app.sources.blog.fetch_page")
def test_a_code_block_stays_one_fenced_block(mock_fetch):
    # trafilatura nests it as <pre><pre>: the book got two empty fences and
    # the code flattened into a paragraph between them.
    mock_fetch.return_value = _page("<pre><code>def f(x):\n    return x**2</code></pre>")
    md = html_to_markdown(scrape_article("https://x.test/a").content_html)
    assert "```\ndef f(x):\n    return x**2\n```" in md
    assert "```\n```" not in md


@patch("app.sources.blog.fetch_page")
def test_inline_code_stays_inside_its_paragraph(mock_fetch):
    mock_fetch.return_value = _page("<p>Run <code>pip install</code> first, then go.</p>")
    md = html_to_markdown(scrape_article("https://x.test/a").content_html)
    assert "Run `pip install` first, then go." in md


@patch("app.sources.blog.fetch_page")
def test_a_numbered_list_keeps_its_numbers(mock_fetch):
    mock_fetch.return_value = _page("<ol><li>Preheat</li><li>Bake</li></ol><ul><li>Salt</li></ul>")
    md = html_to_markdown(scrape_article("https://x.test/a").content_html)
    assert "1. Preheat\n2. Bake" in md
    assert "- Salt" in md


@patch("app.sources.blog.fetch_page")
def test_a_figure_keeps_its_caption_set_apart(mock_fetch):
    # trafilatura drops <figcaption>, and keeps a WordPress caption as a plain
    # paragraph under the image.
    mock_fetch.return_value = _page(
        "<p>Intro.</p>"
        '<figure><img src="https://x.test/a.png" alt="alt A"><figcaption>An <em>hourglass</em>.</figcaption></figure>'
        "<p>Middle.</p>"
        '<div class="wp-caption"><img src="https://x.test/c.png" alt=""><p class="wp-caption-text">A sundial.</p></div>'
        "<p>End.</p>"
    )
    md = html_to_markdown(scrape_article("https://x.test/a").content_html)
    assert "![An hourglass.](https://x.test/a.png)" in md
    assert "![A sundial.](https://x.test/c.png)" in md
    assert "\n\nA sundial.\n\n" not in md


@patch("app.sources.blog.fetch_page")
def test_the_site_header_stays_out_of_the_article(mock_fetch):
    # A magazine with no <article>: favor_recall took its header's drop-down
    # menu (a promo for another issue, the tagline) as the article's opening.
    filler = "<p>" + "A sentence that makes this page an article. " * 40 + "</p>"
    mock_fetch.return_value = (
        "<html><body>"
        '<header class="fixed-top"><div class="collapse"><small>Current issue</small>'
        '<a href="/issues/385"><img src="/issue.jpg" alt="Issue"><h1>Another issue</h1></a>'
        "<p>A bimonthly magazine, demanding and accessible.</p></div></header>"
        f'<div class="row"><h1>The real title</h1><p>Opening.</p>{filler}</div>'
        "<footer><p>All rights reserved, the magazine.</p></footer>"
        "</body></html>"
    )
    md = html_to_markdown(scrape_article("https://x.test/a").content_html)
    assert "Opening." in md
    assert "Current issue" not in md
    assert "Another issue" not in md
    assert "bimonthly" not in md


@patch("app.sources.blog.fetch_page")
def test_an_articles_own_header_is_kept(mock_fetch):
    filler = "<p>" + "A sentence that makes this page an article. " * 40 + "</p>"
    mock_fetch.return_value = (
        "<html><body><article><header><h1>T</h1><p>The standfirst of the piece.</p></header>"
        f"{filler}</article></body></html>"
    )
    md = html_to_markdown(scrape_article("https://x.test/a").content_html)
    assert "The standfirst of the piece." in md


def test_fetch_page_gives_up_when_the_download_hangs():
    # A host that never finishes answering used to strand discovery forever:
    # the timeout fired, but leaving the thread pool waited for the hung
    # download anyway. The fetch must return within its timeout.
    import threading
    import time

    from app.sources import blog

    release = threading.Event()

    def hang(url):
        release.wait(10)
        return None

    try:
        with patch("app.sources.blog.assert_public_url"), patch(
            "app.sources.blog.trafilatura.fetch_url", side_effect=hang
        ), patch("app.sources.blog._browser_fetch", return_value=None):
            start = time.monotonic()
            assert blog.fetch_page("https://slow.example/post", 0.2) is None
            assert time.monotonic() - start < 2
    finally:
        release.set()


# ── paywalls ─────────────────────────────────────────────────────────────────

@patch("app.sources.blog.fetch_page")
def test_a_newsletter_paywall_is_refused_not_compiled_as_a_teaser(mock_fetch):
    # A paid newsletter post serves its opening paragraphs, then a paywall box.
    mock_fetch.return_value = _page('<div class="paywall"><h2>Subscribe to read</h2></div>')
    with pytest.raises(Paywalled):
        scrape_article("https://news.example/p/paid-post")


@patch("app.sources.blog.fetch_page")
def test_a_page_declared_not_free_in_its_metadata_is_refused(mock_fetch):
    ld = '<script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":false}</script>'
    mock_fetch.return_value = _page("").replace("<body>", f"<head>{ld}</head><body>")
    with pytest.raises(Paywalled):
        scrape_article("https://press.example/2026/story")


@patch("app.sources.blog.fetch_page")
def test_a_free_page_mentioning_paywalls_is_not_refused(mock_fetch):
    mock_fetch.return_value = _page("<p>Why the paywall model fails readers.</p>")
    assert scrape_article("https://blog.example/post").content_html


_TEASER = (
    "<p>The opening of a paid post, cut mid-sentence&#8230;</p>"
    '<p>\n  <a href="https://news.example/p/paid">\n    Read more\n  </a>\n</p>'
)


@patch("app.sources.blog.feedparser.parse")
def test_a_newsletter_feed_flags_its_paid_posts_from_their_teaser(mock_parse):
    result = _make_feed_result([
        _make_entry(link="https://news.example/p/paid", content=[_make_content_item(_TEASER)]),
        _make_entry(link="https://news.example/p/free", content=[_make_content_item("<p>All of it.</p>")]),
    ])
    result.feed["generator"] = "Substack"
    mock_parse.return_value = result

    _title, articles = list_feed("https://news.example/feed")

    assert [a.paywalled for a in articles] == [True, False]


@patch("app.sources.blog.feedparser.parse")
def test_an_excerpt_feed_elsewhere_is_not_taken_for_a_paywall(mock_parse):
    # A blog that only syndicates excerpts ends them the same way; its page
    # is free, so nothing is flagged.
    mock_parse.return_value = _make_feed_result([
        _make_entry(link="https://news.example/p/paid", content=[_make_content_item(_TEASER)]),
    ])
    _title, articles = list_feed("https://blog.example/feed")
    assert articles[0].paywalled is False


def test_og_site_name_is_read_off_the_page():
    from app.sources.blog import _og_site_name

    html = '<html><head><meta property="og:site_name" content=" Example Review "></head></html>'
    assert _og_site_name(html) == "Example Review"
    assert _og_site_name("<html><head></head></html>") is None


@pytest.mark.parametrize("extracted, page, expected", [
    # A sidebar heading taken for the title: the <title>'s head, also a heading, wins.
    ("Stay Connected", "<title>Stoicism | Some Encyclopedia</title><h1>Stoicism</h1><h1>Stay Connected</h1>", "Stoicism"),
    # The site's own name taken for the title.
    ("Some Encyclopedia", "<title>Stoicism (Some Encyclopedia)</title><h1>Some Encyclopedia</h1><h1>Stoicism</h1>", "Stoicism"),
    # Nothing extracted.
    ("", "<title>Stoicism - Some Encyclopedia</title><h2>Stoicism</h2>", "Stoicism"),
    # The extracted title is in the <title>: kept.
    ("Stoicism", "<title>Stoicism | Some Encyclopedia</title><h1>Stoicism</h1>", "Stoicism"),
    # A <title> with no site part never overrides.
    ("How I write", "<title>My Blog</title><h1>My Blog</h1>", "How I write"),
    # The <title>'s head isn't a heading on the page: no proof, kept.
    ("How I write", "<title>Home | My Blog</title><h1>How I write</h1>", "How I write"),
    # The site's name in its own header is no proof.
    ("How I write", "<title>Acme Notes - thoughts on code</title><header><h1>Acme Notes</h1></header>", "How I write"),
    # The extracted title is the article's own <h1>: a hero "Blog" doesn't win.
    ("How I write", "<title>Blog | Acme</title><h1>Blog</h1><article><h1>How I write</h1></article>", "How I write"),
    # Nor does the site's declared name.
    ("How I write", '<title>Acme | Tagline</title><meta property="og:site_name" content="Acme"><h1>Acme</h1>', "How I write"),
])
def test_the_title_is_checked_against_the_page_title(extracted, page, expected):
    assert _checked_title(extracted, f"<html><head>{page}</head></html>") == expected
