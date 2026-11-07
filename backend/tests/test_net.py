import pytest

from app.core.net import BlockedURLError, assert_public_url


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://127.0.0.1:8000/whatever",
        "https://localhost/",  # resolves to loopback
        "http://169.254.169.254/latest/meta-data/",  # cloud metadata endpoint
        "http://192.168.1.10/",
        "http://10.0.0.5/admin",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",  # IPv4-mapped loopback must not slip through
    ],
)
def test_blocks_internal_addresses(url):
    with pytest.raises(BlockedURLError):
        assert_public_url(url)


@pytest.mark.parametrize(
    "url",
    ["file:///etc/passwd", "ftp://example.com/x", "gopher://127.0.0.1/"],
)
def test_blocks_non_http_schemes(url):
    with pytest.raises(BlockedURLError):
        assert_public_url(url)


@pytest.mark.parametrize("url", ["http://8.8.8.8/", "https://1.1.1.1/"])
def test_allows_public_ip_literals(url):
    assert_public_url(url)  # must not raise


def test_allows_unresolvable_host():
    # A name that can't resolve can't be connected to → not an SSRF vector, and
    # failing open keeps offline test runs working.
    assert_public_url("http://nonexistent-thothly-host.invalid/")


def test_blocks_url_without_host():
    with pytest.raises(BlockedURLError):
        assert_public_url("http:///just-a-path")


def test_every_redirect_hop_is_checked(monkeypatch):
    import httpx

    import app.core.net as net

    checked: list[str] = []

    def guard(url: str) -> None:
        checked.append(url)
        if "169.254" in url:  # cloud metadata, reached through a redirect
            raise BlockedURLError("internal")

    real_client = httpx.Client
    monkeypatch.setattr(net, "assert_public_url", guard)
    monkeypatch.setattr(net.httpx, "Client", lambda *a, **kw: real_client(
        *a, **{**kw, "transport": httpx.MockTransport(
            lambda req: httpx.Response(302, headers={"location": "http://169.254.169.254/x"})
        )},
    ))

    assert net.fetch_public("https://cdn.example/ep.mp3", timeout=5, max_bytes=10) is None
    assert checked == ["https://cdn.example/ep.mp3", "http://169.254.169.254/x"]


def test_a_host_that_refuses_a_browser_is_asked_again_as_thothly(web):
    import httpx

    from app.core.net import BOT_UA, fetch_public

    web(lambda req: httpx.Response(200 if req.headers["user-agent"] == BOT_UA else 403, content=b"ok"))
    assert fetch_public("https://upload.example/a.png", timeout=5, max_bytes=10)[0] == b"ok"
