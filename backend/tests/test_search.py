import asyncio
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from yt_dlp.utils import DownloadError

import app.search.service as service
from app.search.models import SearchResult
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


@patch("app.search.web_provider.httpx.post")
def test_web_provider_respects_limit(mock_post):
    rows = "".join(
        f'<div class="result"><a class="result__a" '
        f'href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fe.com%2F{i}">T{i}</a></div>'
        for i in range(10)
    )
    mock_post.return_value = _httpx_response(rows)

    assert len(WebProvider().search("q", limit=3)) == 3


@patch("app.search.web_provider.httpx.post")
def test_web_provider_raises_on_http_error(mock_post):
    mock_post.side_effect = httpx.ConnectError("boom")

    with pytest.raises(RuntimeError):
        WebProvider().search("q", limit=5)


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
