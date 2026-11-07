import asyncio
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from yt_dlp.utils import DownloadError

import app.search.service as service
from app.search.brave_provider import BraveProvider
from app.search.marginalia_provider import MarginaliaProvider
from app.search.models import SearchResult
from app.search.podcast_provider import PodcastProvider
from app.search.web import is_article_like, tidy
from app.search.web_provider import WebProvider
from app.search.youtube_provider import YouTubeProvider


# ── helpers ──────────────────────────────────────────────────────────────────

def _ydl_mock(entries: list) -> MagicMock:
    mock = MagicMock()
    mock.extract_info.return_value = {"entries": entries}
    return mock


@pytest.fixture(autouse=True)
def _clear_youtube_title_cache():
    """The YouTube provider caches original titles process-wide; clear it between
    tests so oEmbed results don't leak across them."""
    from app.search.youtube_provider import _title_cache

    _title_cache.clear()
    yield
    _title_cache.clear()


def _result(rid: str) -> SearchResult:
    return SearchResult(id=rid, type="video", title=rid, url=f"http://x/{rid}", source="youtube")


class _FakeProvider:
    """A Provider stand-in for service/endpoint tests."""

    def __init__(self, name: str, results=None, error: str | None = None):
        self.name = name
        self._results = results or []
        self._error = error

    def search(self, query: str, limit: int, hl: str | None = None):
        self.hl = hl
        if self._error:
            raise RuntimeError(self._error)
        return self._results


# ── YouTubeProvider mapping ──────────────────────────────────────────────────

@patch.object(YouTubeProvider, "_oembed_title", return_value=None)
@patch("app.search.youtube_provider.YoutubeDL")
def test_youtube_provider_maps_entries(mock_cls, _mock_oembed):
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


@patch.object(YouTubeProvider, "_oembed_title", return_value=None)
@patch("app.search.youtube_provider.YoutubeDL")
def test_youtube_provider_derives_thumbnail_and_skips_idless(mock_cls, _mock_oembed):
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


@patch("app.search.youtube_provider.YoutubeDL")
def test_youtube_provider_uses_hl_for_title_localization(mock_cls):
    mock_cls.return_value.__enter__.return_value = _ydl_mock([])

    YouTubeProvider().search("q", limit=3, hl="fr")

    opts = mock_cls.call_args.args[0]
    assert opts["extractor_args"]["youtube"]["lang"] == ["fr"]


@patch("app.search.youtube_provider.YoutubeDL")
def test_youtube_provider_falls_back_to_preferred_lang_without_hl(mock_cls):
    from app.core.config import settings

    mock_cls.return_value.__enter__.return_value = _ydl_mock([])

    YouTubeProvider().search("q", limit=3)

    opts = mock_cls.call_args.args[0]
    assert opts["extractor_args"]["youtube"]["lang"] == settings.preferred_languages


@patch.object(YouTubeProvider, "_oembed_title")
@patch("app.search.youtube_provider.YoutubeDL")
def test_youtube_provider_overrides_titles_with_oembed_original(mock_cls, mock_oembed):
    mock_cls.return_value.__enter__.return_value = _ydl_mock([
        {"id": "vid1", "title": "Learn Python in 1 hour"},  # flat = auto-translated
        {"id": "vid2", "title": "Some Video"},  # oEmbed fails → flat title kept
    ])
    mock_oembed.side_effect = lambda url: (
        "Apprendre Python en 1 heure" if "vid1" in url else None
    )

    results = YouTubeProvider().search("python", limit=5)

    assert results[0].title == "Apprendre Python en 1 heure"  # overridden to original
    assert results[1].title == "Some Video"  # oEmbed failed → flat title preserved


@patch.object(YouTubeProvider, "_oembed_title", return_value="cached title")
@patch("app.search.youtube_provider.YoutubeDL")
def test_youtube_provider_caches_oembed_titles(mock_cls, mock_oembed):
    mock_cls.return_value.__enter__.return_value = _ydl_mock(
        [{"id": "vid1", "title": "flat"}]
    )

    YouTubeProvider().search("q", limit=5)
    YouTubeProvider().search("q", limit=5)  # same video resurfaces

    assert mock_oembed.call_count == 1  # second lookup served from the title cache


# ── Web rules, through the DuckDuckGo HTML provider ────────────────────────────────────

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

    results = tidy(WebProvider().search("example", limit=5))

    # Ad skipped, duplicate collapsed → one normalized hit.
    assert len(results) == 1
    r = results[0]
    assert r.id == "web:https://example.com/post"
    assert r.type == "web"
    assert r.source == "web"
    assert r.title == "Example Post"
    assert r.url == "https://example.com/post"
    assert r.author is None
    assert r.meta["snippet"] == "A snippet about the post."


# A brand query returning a site's bare home and its localized mirrors: the same
# source, which discovery expands into the same feed — one card, not three.
_DDG_LOCALE_HTML = """
<div class="result"><a class="result__a"
  href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fquillnotes.example%2F">QuillNotes</a></div>
<div class="result"><a class="result__a"
  href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fquillnotes.example%2Ffr">QuillNotes FR</a></div>
<div class="result"><a class="result__a"
  href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.quillnotes.example%2Fen-us%3Futm%3Dx">QuillNotes EN</a></div>
"""


@patch("app.search.web_provider.httpx.post")
def test_web_provider_collapses_locale_home_variants(mock_post):
    mock_post.return_value = _httpx_response(_DDG_LOCALE_HTML)

    results = tidy(WebProvider().search("quillnotes", limit=5))

    # All three are the same blog home (bare, /fr, /en-us + tracking) → one hit,
    # the first (best-ranked) bare-home URL kept.
    assert [r.url for r in results] == ["https://quillnotes.example/"]


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
    assert len(tidy(WebProvider().search("blog", limit=5))) == 2


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

    assert len(tidy(WebProvider().search("q", limit=3))) == 3


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

    assert [r.url for r in tidy(WebProvider().search("widget", limit=5))] == [
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

    assert [r.url for r in tidy(WebProvider().search("widget", limit=5))] == [
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
    assert [r.url for r in tidy(WebProvider().search("blog", limit=5))] == [
        "https://blog.example/deep-post"
    ]


@patch("app.search.web_provider.httpx.post")
def test_web_provider_keeps_lone_home(mock_post):
    html = """
    <div class="result"><a class="result__a"
      href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fquillnotes.example%2F">QuillNotes</a></div>
    """
    mock_post.return_value = _httpx_response(html)

    # A home with no deeper sibling is a valid source (discovery expands it).
    assert [r.url for r in tidy(WebProvider().search("quillnotes", limit=5))] == [
        "https://quillnotes.example/"
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
    results = tidy(WebProvider().search("q", limit=10))
    assert len(results) == 3
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
def test_web_results_are_capped_per_domain(mock_get):
    payload = {
        "results": [
            {"url": f"https://big.example/post-{i}", "title": f"P{i}"}
            for i in range(6)
        ]
    }
    mock_get.return_value = _httpx_response("")
    mock_get.return_value.json.return_value = payload

    # One domain shouldn't flood the list, even with room under the limit.
    results = tidy(MarginaliaProvider().search("q", limit=10))
    assert len(results) == 3


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

# The factory wraps the chosen backend in a filter and a cache, so these tests
# assert the selection on `_pick_web_provider`, which returns it bare.

def test_web_backend_defaults_to_marginalia(monkeypatch):
    monkeypatch.setattr(service.settings, "web_search_backend", "marginalia")
    assert isinstance(service._pick_web_provider(), MarginaliaProvider)


def test_web_backend_unknown_falls_back_to_marginalia(monkeypatch):
    monkeypatch.setattr(service.settings, "web_search_backend", "nonsense")
    assert isinstance(service._pick_web_provider(), MarginaliaProvider)


def test_web_backend_ddg_selectable(monkeypatch):
    monkeypatch.setattr(service.settings, "web_search_backend", "ddg")
    assert isinstance(service._pick_web_provider(), WebProvider)


def test_web_backend_brave_requires_key(monkeypatch):
    monkeypatch.setattr(service.settings, "web_search_backend", "brave")
    monkeypatch.setattr(service.settings, "brave_api_key", None)
    # Selected without a key → falls back rather than breaking search.
    assert isinstance(service._pick_web_provider(), MarginaliaProvider)
    monkeypatch.setattr(service.settings, "brave_api_key", "test-key")
    assert isinstance(service._pick_web_provider(), BraveProvider)


def test_cached_web_provider_caches_and_skips_short_queries():
    calls = {"n": 0}

    class _Counting:
        name = "web"

        def search(self, query, limit, hl=None):
            calls["n"] += 1
            return [_result("web:1")]

    cached = service._CachedProvider(_Counting())

    # Too short → skipped entirely, backend never called.
    assert cached.search("ab", 5) == []
    assert calls["n"] == 0

    # First real query hits the backend; an identical repeat is served from cache.
    assert len(cached.search("bitcoin", 5)) == 1
    assert cached.search("bitcoin", 5)  # repeat
    assert calls["n"] == 1  # only the first call reached the backend


# ── Accept-Language → hl plumbing ────────────────────────────────────────────

def test_primary_language_parsing():
    from app.api.search import _primary_language

    assert _primary_language("fr-FR,fr;q=0.9,en;q=0.8") == "fr"
    assert _primary_language("en-US") == "en"
    assert _primary_language("  PT-BR ") == "pt"
    assert _primary_language(None) is None
    assert _primary_language("") is None
    # A wildcard is not a language: YouTube rejects `lang=*` and the whole
    # provider fails. Next's proxy sends this header verbatim.
    assert _primary_language("*") is None
    assert _primary_language("*;q=0.5") is None


def test_search_passes_hl_to_providers(monkeypatch):
    fake = _FakeProvider("youtube", results=[_result("youtube:1")])
    monkeypatch.setattr(service, "PROVIDERS", [fake])

    async def run():
        return [b async for b in service.search_batches("q", hl="fr")]

    asyncio.run(run())

    assert fake.hl == "fr"


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

class _SlowProvider(_FakeProvider):
    def __init__(self, name: str, results, delay_s: float):
        super().__init__(name, results=results)
        self._delay_s = delay_s

    def search(self, query: str, limit: int, hl: str | None = None):
        import time

        time.sleep(self._delay_s)
        return super().search(query, limit, hl)


def _collect_batches(query: str):
    async def run():
        return [b async for b in service.search_batches(query)]

    return asyncio.run(run())


def test_search_batches_yields_each_provider_as_it_finishes(monkeypatch):
    """The fast provider's results must not wait for the slow one."""
    monkeypatch.setattr(service, "PROVIDERS", [
        _SlowProvider("youtube", [_result("youtube:1")], delay_s=0.3),
        _FakeProvider("podcast", results=[_result("podcast:1")]),
    ])

    batches = _collect_batches("q")

    assert [b.provider for b in batches] == ["podcast", "youtube"]
    assert [r.id for r in batches[0].results] == ["podcast:1"]


def test_search_batches_isolates_a_failing_provider(monkeypatch):
    monkeypatch.setattr(service, "PROVIDERS", [
        _FakeProvider("youtube", results=[_result("youtube:1")]),
        _FakeProvider("podcast", error="boom"),
    ])

    batches = {b.provider: b for b in _collect_batches("q")}

    assert [r.id for r in batches["youtube"].results] == ["youtube:1"]
    assert batches["youtube"].error is None
    assert batches["podcast"].results == []
    assert "boom" in batches["podcast"].error


# ── endpoint ─────────────────────────────────────────────────────────────────

def test_search_stream_endpoint_sends_one_json_line_per_provider(
    client: TestClient, monkeypatch
):
    import json

    monkeypatch.setattr(service, "PROVIDERS", [
        _FakeProvider("youtube", results=[_result("youtube:1")]),
        _FakeProvider("podcast", error="down"),
    ])

    res = client.get("/search/stream", params={"q": "x"})

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/x-ndjson")
    lines = [json.loads(line) for line in res.text.splitlines() if line]
    by_provider = {line["provider"]: line for line in lines}
    assert set(by_provider) == {"youtube", "podcast"}
    assert [r["id"] for r in by_provider["youtube"]["results"]] == ["youtube:1"]
    assert by_provider["podcast"]["error"] == "down"


def test_search_stream_endpoint_blank_query_sends_nothing(client: TestClient):
    res = client.get("/search/stream", params={"q": "  "})
    assert res.status_code == 200
    assert res.text == ""


def test_paid_youtube_search_follows_the_triage_whichever_backend_answers(monkeypatch):
    """The ScrapeCreators search exists to feed the triage descriptions and
    dates. It must switch on with the triage itself, not with one backend's key:
    a TypeSafe-only setup used to get the triage AND the blind yt-dlp search."""
    import app.core.config as cfg
    from app.search.youtube_provider import YouTubeProvider

    monkeypatch.setattr(cfg.settings, "treg_token", "t")
    provider = YouTubeProvider()
    with patch.object(provider, "_search_scrapecreators", return_value=[]) as paid, \
         patch.object(provider, "_apply_original_titles"):
        monkeypatch.setattr(cfg.settings, "typesafe_api_key", "k")
        monkeypatch.setattr(cfg.settings, "search_triage_api_key", None)
        provider.search("q", 5)
    assert paid.called


# ── every web backend drops non-article hosts ────────────────────────────────

def _web(url: str) -> SearchResult:
    return SearchResult(id=url, type="web", title=url, url=url, source="web")


@pytest.mark.parametrize("backend", ["marginalia", "brave", "exa"])
def test_every_web_backend_drops_social_video_and_shop_hits(backend):
    # Only the DuckDuckGo provider filtered these, so on Exa, Brave or
    # Marginalia a YouTube video or an Instagram profile came back labelled
    # "Article".
    hits = [
        _web("https://www.instagram.com/quillnotes/"),
        _web("https://www.youtube.com/@quillnotes"),
        _web("https://us.amazon.com/stores/author/B0"),
        _web("https://www.facebook.com/quillnotes/posts/1"),
        _web("https://en.wikipedia.org/wiki/Quill_notes"),
    ]
    with (
        patch.object(service.settings, "web_search_backend", backend),
        patch.object(service.settings, "brave_api_key", "k"),
        patch.object(service.gateway, "available", return_value=True),
        patch.object(MarginaliaProvider, "search", return_value=hits),
        patch.object(BraveProvider, "search", return_value=hits),
        patch.object(service.ExaProvider, "search", return_value=hits),
    ):
        provider = service._build_web_provider()
        urls = [r.url for r in provider.search("quill notes", 10)]
    assert urls == ["https://en.wikipedia.org/wiki/Quill_notes"]


@pytest.mark.parametrize("url", [
    "https://jobs.boeing.com/job/berkeley/mechanical-design-engineer/185/102910579072",
    "https://www.indeed.com/q-design-engineer-l-las-vegas,-nv-jobs.html",
    "https://www.glassdoor.com/Job/design-engineer-jobs-SRCH_KO0,15.htm",
    "https://careers.example.com/open-roles/design-engineer",
    "https://example.com/careers/design-engineer",
    "https://example.com/jobs/1234-design-engineer",
    "https://boards.greenhouse.io/acme/jobs/123",
    "https://jobs.lever.co/acme/abc-123",
    "https://www.welcometothejungle.com/fr/companies/acme/jobs/design-engineer",
])
def test_job_pages_are_not_articles(url):

    assert is_article_like(url) is False


@pytest.mark.parametrize("url", [
    "https://jbi.global/sites/default/files/How%20To%20Create%20A%20Thread%20On%20X.Pdf",
    "https://example.com/papers/report.pdf",
    "https://example.com/report.PDF?download=1",
    "https://example.com/slides/deck.pptx",
    "https://example.com/files/sheet.xlsx",
    "https://example.com/files/notes.docx",
    "https://example.com/archive.zip",
    "https://example.com/books/novel.epub",
    "https://example.com/media/talk.mp4",
    "https://example.com/img/diagram.png",
])
def test_files_are_not_articles(url):

    assert is_article_like(url) is False


@pytest.mark.parametrize("url", [
    "https://example.com/post.html",
    "https://example.com/index.php",
    "https://example.com/blog/why-i-moved-to-node.js",
    "https://example.com/releases/v2.5",
    "https://en.wikipedia.org/wiki/ThreadX",
])
def test_web_pages_with_dots_are_still_articles(url):

    assert is_article_like(url) is True


def test_an_article_about_jobs_is_still_an_article():

    assert is_article_like("https://blog.example.com/what-a-design-engineer-does") is True
    assert is_article_like("https://blog.example.com/posts/jobs-to-be-done") is True
