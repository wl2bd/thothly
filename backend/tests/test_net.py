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
