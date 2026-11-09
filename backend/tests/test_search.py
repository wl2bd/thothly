import asyncio
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from yt_dlp.utils import DownloadError

import app.search.service as service
from app.search.marginalia_provider import MarginaliaProvider
from app.search.models import SearchResult
from app.search.podcast_provider import PodcastProvider
from app.search.web import is_article_like, tidy, web_result
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


# ── Web rules (app/search/web.py), applied to every engine's hits ─────────────

def _hits(*urls: str) -> list[SearchResult]:
    return [web_result(u, u) for u in urls]


def _httpx_response(text: str, status: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.text = text
    resp.raise_for_status.return_value = None
    return resp


def test_tidy_collapses_duplicate_urls():
    assert [r.url for r in tidy(_hits("https://example.com/post", "https://example.com/post"))] == [
        "https://example.com/post"
    ]


def test_tidy_collapses_locale_home_variants():
    # A brand query returning a site's bare home and its localized mirrors: the
    # same source, which discovery expands into the same feed — one card, not three.
    results = tidy(_hits(
        "https://quillnotes.example/",
        "https://quillnotes.example/fr",
        "https://www.quillnotes.example/en-us?utm=x",
    ))
    assert [r.url for r in results] == ["https://quillnotes.example/"]


def test_tidy_keeps_distinct_articles():
    # Different article paths on the same host are NOT the same source.
    assert len(tidy(_hits("https://blog.com/post-a", "https://blog.com/post-b"))) == 2


def test_tidy_drops_non_article_shapes():
    # A product page, a taxonomy listing and a forum thread are non-article URL
    # shapes; the real article (whose slug merely contains "widget") survives.
    assert [r.url for r in tidy(_hits(
        "https://shop.example/product/widget",
        "https://news.example/tag/finance",
        "https://forum.example/viewtopic?t=9",
        "https://blog.example/how-the-widget-works",
    ))] == ["https://blog.example/how-the-widget-works"]


def test_tidy_drops_on_site_search_query():
    # A URL carrying an on-site search/listing query param is not an article.
    assert [r.url for r in tidy(_hits(
        "https://site.example/?s=widget", "https://site.example/the-widget-guide"
    ))] == ["https://site.example/the-widget-guide"]


def test_tidy_drops_home_when_deeper_article_present():
    # The bare home is redundant when a deeper article from the same site is present.
    assert [r.url for r in tidy(_hits("https://blog.example/", "https://blog.example/deep-post"))] == [
        "https://blog.example/deep-post"
    ]


def test_tidy_keeps_lone_home():
    # A home with no deeper sibling is a valid source (discovery expands it).
    assert [r.url for r in tidy(_hits("https://quillnotes.example/"))] == [
        "https://quillnotes.example/"
    ]


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


# ── web backend selection (config-driven) ────────────────────────────────────

# The factory wraps the chosen backend in a filter and a cache, so these tests
# assert the selection on `_pick_web_provider`, which returns it bare.

def test_web_search_uses_the_gateway_when_a_key_is_set(monkeypatch):
    monkeypatch.setattr(service.gateway, "available", lambda route: True)
    assert isinstance(service._pick_web_provider(), service.ExaProvider)


def test_web_search_falls_back_to_marginalia_without_a_key(monkeypatch):
    # A fresh clone with no TREG_TOKEN or MONID_API_KEY still searches the web.
    monkeypatch.setattr(service.gateway, "available", lambda route: False)
    assert isinstance(service._pick_web_provider(), MarginaliaProvider)


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


def _yt(vid: str) -> SearchResult:
    return SearchResult(
        id=f"youtube:{vid}", type="video", title=vid,
        url=f"https://www.youtube.com/watch?v={vid}", source="youtube",
    )


def test_youtube_search_stays_on_free_ytdlp_when_it_answers(monkeypatch):
    """yt-dlp answers in ~1 s for free; the paid search (6-10 s, billed per
    keystroke) must not run while it works, even with the triage on."""
    import app.core.config as cfg
    from app.search.youtube_provider import YouTubeProvider

    monkeypatch.setattr(cfg.settings, "treg_token", "t")
    monkeypatch.setattr(cfg.settings, "llm_api_key", "k")
    monkeypatch.setattr(cfg.settings, "llm_base_url", "https://openrouter.ai/api/v1")
    provider = YouTubeProvider()
    with patch.object(provider, "_search_ytdlp", return_value=[_yt("a")]), \
         patch.object(provider, "_search_scrapecreators") as paid, \
         patch.object(provider, "_apply_original_titles"):
        results = provider.search("q", 5)
    assert [r.id for r in results] == ["youtube:a"]
    assert not paid.called


@pytest.mark.parametrize("free", [RuntimeError("blocked"), []])
def test_youtube_search_falls_back_to_paid_when_ytdlp_fails_or_is_empty(monkeypatch, free):
    """If YouTube blocks or breaks yt-dlp, the paid search keeps videos coming."""
    import app.core.config as cfg
    from app.search.youtube_provider import YouTubeProvider

    monkeypatch.setattr(cfg.settings, "treg_token", "t")
    provider = YouTubeProvider()
    kw = {"side_effect": free} if isinstance(free, Exception) else {"return_value": free}
    with patch.object(provider, "_search_ytdlp", **kw), \
         patch.object(provider, "_search_scrapecreators", return_value=[_yt("b")]), \
         patch.object(provider, "_apply_original_titles"):
        results = provider.search("q", 5)
    assert [r.id for r in results] == ["youtube:b"]


def test_youtube_search_without_a_key_surfaces_the_ytdlp_failure(monkeypatch):
    import app.core.config as cfg
    from app.search.youtube_provider import YouTubeProvider

    monkeypatch.setattr(cfg.settings, "treg_token", None)
    provider = YouTubeProvider()
    with patch.object(provider, "_search_ytdlp", side_effect=RuntimeError("blocked")), \
         patch.object(provider, "_search_scrapecreators") as paid:
        with pytest.raises(RuntimeError):
            provider.search("q", 5)
    assert not paid.called


# ── every web backend drops non-article hosts ────────────────────────────────

def _web(url: str) -> SearchResult:
    return SearchResult(id=url, type="web", title=url, url=url, source="web")


@pytest.mark.parametrize("keyed", [True, False])
def test_every_web_backend_drops_social_video_and_shop_hits(keyed):
    # A YouTube video or an Instagram profile must not come back labelled
    # "Article", whichever engine answered.
    hits = [
        _web("https://www.instagram.com/quillnotes/"),
        _web("https://www.youtube.com/@quillnotes"),
        _web("https://us.amazon.com/stores/author/B0"),
        _web("https://www.facebook.com/quillnotes/posts/1"),
        _web("https://en.wikipedia.org/wiki/Quill_notes"),
    ]
    with (
        patch.object(service.gateway, "available", return_value=keyed),
        patch.object(MarginaliaProvider, "search", return_value=hits),
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


# ── a relevance every provider's results share ───────────────────────────────

def test_keyword_rank_gives_every_result_a_0_to_3_relevance():
    """Without the triage, the keyword score still sets `relevance` on the same
    0-3 scale, so the UI can interleave providers either way."""
    hits = [
        SearchResult(id="a", type="web", title="Unrelated page", url="https://a.example/x", source="web"),
        SearchResult(id="b", type="video", title="Stoic letters explained", url="https://y/b", source="youtube"),
        SearchResult(id="c", type="web", title="Stoic basics", url="https://c.example/", source="web"),
    ]
    ranked = service._rank(hits, "stoic letters")
    by_id = {r.id: r.relevance for r in ranked}
    assert by_id["a"] == 0
    assert 0 < by_id["b"] <= 3
    assert all(0 <= v <= 3 for v in by_id.values())
    assert by_id["b"] > by_id["c"] > by_id["a"]
