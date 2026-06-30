import asyncio
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from yt_dlp.utils import DownloadError

import app.search.service as service
import app.search.web_provider as web_provider
from app.search.brave_provider import BraveProvider
from app.search.marginalia_provider import MarginaliaProvider
from app.search.models import SearchResult
from app.search.podcast_provider import PodcastProvider
from app.search.web_provider import WebProvider
from app.search.youtube_provider import YouTubeProvider


# ── helpers ──────────────────────────────────────────────────────────────────

def _ydl_mock(entries: list) -> MagicMock:
    mock = MagicMock()
    mock.extract_info.return_value = {"entries": entries}
    return mock


def _result(rid: str) -> SearchResult:
    return SearchResult(id=rid, type="video", title=rid, url=f"http://x/{rid}", source="youtube")


class _FakeProvider:
    """A Provider stand-in for service/endpoint tests."""

    def __init__(self, name: str, results=None, error: str | None = None):
        self.name = name
        self._results = results or []
        self._error = error

    def search(self, query: str, limit: int):
        if self._error:
            raise RuntimeError(self._error)
        return self._results


# ── YouTubeProvider mapping ──────────────────────────────────────────────────

@patch("app.search.youtube_provider.YoutubeDL")
def test_youtube_provider_maps_entries(mock_cls):
    mock_cls.return_value.__enter__.return_value = _ydl_mock([
        {
            "id": "abc123",
            "title": "How transformers work",
            "duration": 615,
            "channel": "3Blue1Brown",
            "channel_url": "https://www.youtube.com/channel/UCYO",
            "thumbnails": [{"url": "http://small.jpg"}, {"url": "http://large.jpg"}],
        },
    ])

    results = YouTubeProvider().search("transformers", limit=5)

    assert len(results) == 1
    r = results[0]
    assert r.id == "youtube:abc123"
    assert r.type == "video"
    assert r.source == "youtube"
    assert r.title == "How transformers work"
    assert r.url == "https://www.youtube.com/watch?v=abc123"
    assert r.duration_s == 615
    assert r.author == "3Blue1Brown"
    assert r.thumbnail == "http://large.jpg"  # last (largest) thumbnail
    assert r.meta["channel_url"] == "https://www.youtube.com/channel/UCYO"


@patch("app.search.youtube_provider.YoutubeDL")
def test_youtube_provider_derives_thumbnail_and_skips_idless(mock_cls):
    mock_cls.return_value.__enter__.return_value = _ydl_mock([
        {"id": "xyz789", "title": "No thumbs"},
        {"title": "Dropped — no id"},
        None,
    ])

    results = YouTubeProvider().search("q", limit=5)

    assert len(results) == 1
    assert results[0].thumbnail == "https://i.ytimg.com/vi/xyz789/hqdefault.jpg"


@patch("app.search.youtube_provider.YoutubeDL")
def test_youtube_provider_raises_on_ydl_error(mock_cls):
    mock_ydl = MagicMock()
    mock_ydl.extract_info.side_effect = DownloadError("rate limited")
    mock_cls.return_value.__enter__.return_value = mock_ydl

    with pytest.raises(RuntimeError):
        YouTubeProvider().search("q", limit=5)


# ── WebProvider (DuckDuckGo HTML) mapping ────────────────────────────────────

# A trimmed DuckDuckGo HTML results page: one normal hit (via the /l/ redirect),
# one sponsored hit that must be skipped, and a duplicate of the first.
_DDG_HTML = """
<div class="result results_links results_links_deep web-result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpost&rut=x">
    Example Post
  </a>
  <a class="result__snippet">A snippet about the post.</a>
</div>
<div class="result result--ad">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fad.example%2Fbuy">Ad</a>
</div>
<div class="result web-result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpost">Dup</a>
</div>
"""


def _httpx_response(text: str, status: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.text = text
    resp.raise_for_status.return_value = None
    return resp


@patch("app.search.web_provider.httpx.post")
def test_web_provider_parses_results(mock_post):
    mock_post.return_value = _httpx_response(_DDG_HTML)

    results = WebProvider().search("example", limit=5)

    # Ad skipped, duplicate collapsed → one normalized hit.
    assert len(results) == 1
    r = results[0]
    assert r.id == "web:https://example.com/post"
    assert r.type == "web"
    assert r.source == "web"
    assert r.title == "Example Post"
    assert r.url == "https://example.com/post"
    assert r.author == "example.com"
    assert r.meta["snippet"] == "A snippet about the post."


# A brand query returning a site's bare home and its localized mirrors: the same
# source, which discovery expands into the same feed — one card, not three.
_DDG_LOCALE_HTML = """
<div class="result"><a class="result__a"
  href="//duckduckgo.com/l/?uddg=https%3A%2F%2Ftokenbrice.xyz%2F">TokenBrice</a></div>
<div class="result"><a class="result__a"
  href="//duckduckgo.com/l/?uddg=https%3A%2F%2Ftokenbrice.xyz%2Ffr">TokenBrice FR</a></div>
<div class="result"><a class="result__a"
  href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.tokenbrice.xyz%2Fen-us%3Futm%3Dx">TokenBrice EN</a></div>
"""


@patch("app.search.web_provider.httpx.post")
def test_web_provider_collapses_locale_home_variants(mock_post):
    mock_post.return_value = _httpx_response(_DDG_LOCALE_HTML)

    results = WebProvider().search("tokenbrice", limit=5)

    # All three are the same blog home (bare, /fr, /en-us + tracking) → one hit,
    # the first (best-ranked) bare-home URL kept.
    assert [r.url for r in results] == ["https://tokenbrice.xyz/"]


@patch("app.search.web_provider.httpx.post")
def test_web_provider_keeps_distinct_articles(mock_post):
    html = """
    <div class="result"><a class="result__a"
      href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fblog.com%2Fpost-a">A</a></div>
    <div class="result"><a class="result__a"
      href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fblog.com%2Fpost-b">B</a></div>
    """
    mock_post.return_value = _httpx_response(html)

    # Different article paths on the same host are NOT the same source.
    assert len(WebProvider().search("blog", limit=5)) == 2


@patch("app.search.web_provider.httpx.post")
def test_web_provider_respects_limit(mock_post):
    # Distinct hosts (one deep article each) so the per-domain cap never bites —
    # this test isolates the `limit` truncation alone.
    rows = "".join(
        f'<div class="result"><a class="result__a" '
        f'href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fe{i}.com%2Fpost">T{i}</a></div>'
        for i in range(10)
    )
    mock_post.return_value = _httpx_response(rows)

    assert len(WebProvider().search("q", limit=3)) == 3


@patch("app.search.web_provider.httpx.post")
def test_web_provider_drops_non_article_shapes(mock_post):
    # A product page, a taxonomy listing and a forum thread are non-article URL
    # shapes; the real article (whose slug merely contains "widget") survives.
    html = """
    <div class="result"><a class="result__a"
      href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fshop.example%2Fproduct%2Fwidget">Buy</a></div>
    <div class="result"><a class="result__a"
      href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnews.example%2Ftag%2Ffinance">Tag</a></div>
    <div class="result"><a class="result__a"
      href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fforum.example%2Fviewtopic%3Ft%3D9">Thread</a></div>
    <div class="result"><a class="result__a"
      href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fblog.example%2Fhow-the-widget-works">Article</a></div>
    """
    mock_post.return_value = _httpx_response(html)

    assert [r.url for r in WebProvider().search("widget", limit=5)] == [
        "https://blog.example/how-the-widget-works"
    ]


@patch("app.search.web_provider.httpx.post")
def test_web_provider_drops_on_site_search_query(mock_post):
    # A URL carrying an on-site search/listing query param is not an article.
    html = """
    <div class="result"><a class="result__a"
      href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fsite.example%2F%3Fs%3Dwidget">Search</a></div>
    <div class="result"><a class="result__a"
      href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fsite.example%2Fthe-widget-guide">Guide</a></div>
    """
    mock_post.return_value = _httpx_response(html)

    assert [r.url for r in WebProvider().search("widget", limit=5)] == [
        "https://site.example/the-widget-guide"
    ]


@patch("app.search.web_provider.httpx.post")
def test_web_provider_drops_home_when_deeper_article_present(mock_post):
    html = """
    <div class="result"><a class="result__a"
      href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fblog.example%2F">Home</a></div>
    <div class="result"><a class="result__a"
      href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fblog.example%2Fdeep-post">Deep</a></div>
    """
    mock_post.return_value = _httpx_response(html)

    # The bare home is redundant when a deeper article from the same site is
    # present → only the article survives.
    assert [r.url for r in WebProvider().search("blog", limit=5)] == [
        "https://blog.example/deep-post"
    ]


@patch("app.search.web_provider.httpx.post")
def test_web_provider_keeps_lone_home(mock_post):
    html = """
    <div class="result"><a class="result__a"
      href="//duckduckgo.com/l/?uddg=https%3A%2F%2Ftokenbrice.xyz%2F">TokenBrice</a></div>
    """
    mock_post.return_value = _httpx_response(html)

    # A home with no deeper sibling is a valid source (discovery expands it).
    assert [r.url for r in WebProvider().search("tokenbrice", limit=5)] == [
        "https://tokenbrice.xyz/"
    ]


@patch("app.search.web_provider.httpx.post")
def test_web_provider_caps_results_per_domain(mock_post):
    rows = "".join(
        f'<div class="result"><a class="result__a" '
        f'href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fbig.example%2Fpost-{i}">P{i}</a></div>'
        for i in range(6)
    )
    mock_post.return_value = _httpx_response(rows)

    # One domain shouldn't flood the list: capped even with room under the limit.
    results = WebProvider().search("q", limit=10)
    assert len(results) == web_provider._MAX_PER_DOMAIN
    assert all("big.example" in r.url for r in results)


@patch("app.search.web_provider.httpx.post")
def test_web_provider_raises_on_http_error(mock_post):
    mock_post.side_effect = httpx.ConnectError("boom")

    with pytest.raises(RuntimeError):
        WebProvider().search("q", limit=5)


# ── MarginaliaProvider (default web backend) mapping ─────────────────────────

_MARGINALIA_PAYLOAD = {
    "license": "CC-BY-NC-SA 4.0",
    "results": [
        {
            "url": "https://k3tan.com/the-importance-of-bitcoin-self-custody/",
            "title": "The Importance of Bitcoin Self Custody",
            "description": "Self custody is a principle we cannot back away from.",
        },
        {"url": "", "title": "Dropped — no url", "description": "x"},
    ],
}


@patch("app.search.marginalia_provider.httpx.get")
def test_marginalia_provider_maps_results(mock_get):
    mock_get.return_value = _httpx_response("")
    mock_get.return_value.json.return_value = _MARGINALIA_PAYLOAD

    results = MarginaliaProvider().search("bitcoin self custody", limit=5)

    assert len(results) == 1  # url-less entry dropped
    r = results[0]
    assert r.id == "web:https://k3tan.com/the-importance-of-bitcoin-self-custody/"
    assert r.type == "web"
    assert r.source == "web"
    assert r.title == "The Importance of Bitcoin Self Custody"
    assert r.url == "https://k3tan.com/the-importance-of-bitcoin-self-custody/"
    # Web hits carry no author — the site identity is the URL/domain itself.
    assert r.author is None
    assert r.meta["snippet"] == "Self custody is a principle we cannot back away from."


@patch("app.search.marginalia_provider.httpx.get")
def test_marginalia_provider_caps_results_per_domain(mock_get):
    payload = {
        "results": [
            {"url": f"https://big.example/post-{i}", "title": f"P{i}"}
            for i in range(6)
        ]
    }
    mock_get.return_value = _httpx_response("")
    mock_get.return_value.json.return_value = payload

    # One domain shouldn't flood the list, even with room under the limit.
    results = MarginaliaProvider().search("q", limit=10)
    assert len(results) == 3  # _MAX_PER_DOMAIN


@patch("app.search.marginalia_provider.httpx.get")
def test_marginalia_provider_raises_on_http_error(mock_get):
    mock_get.side_effect = httpx.ConnectError("boom")

    with pytest.raises(RuntimeError):
        MarginaliaProvider().search("q", limit=5)


# ── BraveProvider (commercial web backend) mapping ───────────────────────────

_BRAVE_PAYLOAD = {
    "web": {
        "results": [
            {
                "url": "https://example.com/post",
                "title": "An <strong>example</strong> post",
                "description": "A <strong>snippet</strong> with markup.",
            },
            {"title": "Dropped — no url"},
        ]
    }
}


@patch("app.search.brave_provider.httpx.get")
def test_brave_provider_maps_and_strips_markup(mock_get):
    mock_get.return_value = _httpx_response("")
    mock_get.return_value.json.return_value = _BRAVE_PAYLOAD

    results = BraveProvider().search("example", limit=5)

    assert len(results) == 1  # url-less entry dropped
    r = results[0]
    assert r.id == "web:https://example.com/post"
    assert r.type == "web"
    assert r.source == "web"
    assert r.title == "An example post"  # <strong> stripped
    assert r.meta["snippet"] == "A snippet with markup."
    assert r.author is None


@patch("app.search.brave_provider.httpx.get")
def test_brave_provider_raises_on_http_error(mock_get):
    mock_get.side_effect = httpx.ConnectError("boom")

    with pytest.raises(RuntimeError):
        BraveProvider().search("q", limit=5)


# ── web backend selection (config-driven) ────────────────────────────────────

# The factory wraps the chosen backend in a cache (see `_CachedWebProvider`), so
# tests reach through `._inner` to assert which backend was selected.

def test_web_backend_defaults_to_marginalia(monkeypatch):
    monkeypatch.setattr(service.settings, "web_search_backend", "marginalia")
    assert isinstance(service._build_web_provider()._inner, MarginaliaProvider)


def test_web_backend_unknown_falls_back_to_marginalia(monkeypatch):
    monkeypatch.setattr(service.settings, "web_search_backend", "nonsense")
    assert isinstance(service._build_web_provider()._inner, MarginaliaProvider)


def test_web_backend_ddg_selectable(monkeypatch):
    monkeypatch.setattr(service.settings, "web_search_backend", "ddg")
    assert isinstance(service._build_web_provider()._inner, WebProvider)


def test_web_backend_brave_requires_key(monkeypatch):
    monkeypatch.setattr(service.settings, "web_search_backend", "brave")
    monkeypatch.setattr(service.settings, "brave_api_key", None)
    # Selected without a key → falls back rather than breaking search.
    assert isinstance(service._build_web_provider()._inner, MarginaliaProvider)
    monkeypatch.setattr(service.settings, "brave_api_key", "test-key")
    assert isinstance(service._build_web_provider()._inner, BraveProvider)


def test_cached_web_provider_caches_and_skips_short_queries():
    calls = {"n": 0}

    class _Counting:
        name = "web"

        def search(self, query, limit):
            calls["n"] += 1
            return [_result("web:1")]

    cached = service._CachedWebProvider(_Counting())

    # Too short → skipped entirely, backend never called.
    assert cached.search("ab", 5) == []
    assert calls["n"] == 0

    # First real query hits the backend; an identical repeat is served from cache.
    assert len(cached.search("bitcoin", 5)) == 1
    assert cached.search("bitcoin", 5)  # repeat
    assert calls["n"] == 1  # only the first call reached the backend


# ── PodcastProvider (iTunes Search API) mapping ──────────────────────────────

_ITUNES_PAYLOAD = {
    "results": [
        {
            "trackId": 4242,
            "trackName": "Episode 1: Origins",
            "collectionName": "The Show",
            "episodeUrl": "https://cdn.example/ep1.mp3",
            "trackTimeMillis": 3_600_000,
            "artworkUrl600": "https://art/600.jpg",
            "artworkUrl100": "https://art/100.jpg",
            "feedUrl": "https://show.example/feed.xml",
            "releaseDate": "2026-01-02T00:00:00Z",
            "trackViewUrl": "https://podcasts.apple.com/ep1",
        },
        # No audio enclosure -> dropped (can't be transcribed into a chapter).
        {"trackId": 7, "trackName": "Trailer", "collectionName": "The Show"},
    ]
}


@patch("app.search.podcast_provider.httpx.get")
def test_podcast_provider_maps_episodes(mock_get):
    mock_get.return_value = _httpx_response("")
    mock_get.return_value.json.return_value = _ITUNES_PAYLOAD

    results = PodcastProvider().search("origins", limit=5)

    assert len(results) == 1  # trailer without episodeUrl dropped
    r = results[0]
    assert r.id == "podcast:4242"
    assert r.type == "episode"
    assert r.source == "podcast"
    assert r.title == "Episode 1: Origins"
    assert r.url == "https://cdn.example/ep1.mp3"
    assert r.duration_s == 3600  # 3_600_000 ms
    assert r.author == "The Show"
    assert r.thumbnail == "https://art/600.jpg"  # largest artwork
    assert r.meta["feed_url"] == "https://show.example/feed.xml"


@patch("app.search.podcast_provider.httpx.get")
def test_podcast_provider_raises_on_http_error(mock_get):
    mock_get.side_effect = httpx.ConnectError("boom")

    with pytest.raises(RuntimeError):
        PodcastProvider().search("q", limit=5)


# ── service: parallel merge + per-provider isolation ─────────────────────────

def test_search_all_merges_all_providers(monkeypatch):
    monkeypatch.setattr(service, "PROVIDERS", [
        _FakeProvider("a", results=[_result("a:1")]),
        _FakeProvider("b", results=[_result("b:1"), _result("b:2")]),
    ])

    resp = asyncio.run(service.search_all("q"))

    assert {r.id for r in resp.results} == {"a:1", "b:1", "b:2"}
    assert resp.errors == []


def test_search_all_isolates_a_failing_provider(monkeypatch):
    monkeypatch.setattr(service, "PROVIDERS", [
        _FakeProvider("youtube", results=[_result("youtube:1")]),
        _FakeProvider("podcast", error="boom"),
    ])

    resp = asyncio.run(service.search_all("q"))

    assert [r.id for r in resp.results] == ["youtube:1"]
    assert len(resp.errors) == 1
    assert resp.errors[0].provider == "podcast"
    assert "boom" in resp.errors[0].message


# ── endpoint ─────────────────────────────────────────────────────────────────

def test_search_endpoint_blank_query_is_empty(client: TestClient):
    body = client.get("/search", params={"q": "   "}).json()
    assert body == {"results": [], "errors": []}


def test_search_endpoint_returns_results(client: TestClient, monkeypatch):
    monkeypatch.setattr(
        service, "PROVIDERS", [_FakeProvider("youtube", results=[_result("youtube:1")])]
    )

    res = client.get("/search", params={"q": "python"})

    assert res.status_code == 200
    body = res.json()
    assert [r["id"] for r in body["results"]] == ["youtube:1"]
    assert body["errors"] == []


def test_search_endpoint_surfaces_partial_error(client: TestClient, monkeypatch):
    monkeypatch.setattr(service, "PROVIDERS", [
        _FakeProvider("youtube", results=[_result("youtube:1")]),
        _FakeProvider("podcast", error="down"),
    ])

    body = client.get("/search", params={"q": "x"}).json()

    assert len(body["results"]) == 1
    assert [e["provider"] for e in body["errors"]] == ["podcast"]
