"""Guard outbound fetches against SSRF to private / internal hosts.

Thothly fetches arbitrary user-supplied URLs (blog pages, RSS feeds, podcast
audio, and images referenced by scraped pages). Without a check, a pasted
``http://169.254.169.254/…`` (cloud metadata) or ``http://127.0.0.1:…`` would be
fetched against the host's own network. ``assert_public_url`` resolves a URL's
host and blocks it when any resolved address is private, loopback, link-local,
reserved, or otherwise non-global.

Limitations (acceptable for a single-user tool that binds to localhost by
default and is documented as "do not expose to the public internet"):

- Resolution happens once, at check time. A host that resolves to a public
  address here and a private one at connect time (DNS rebinding) is not caught.
- Only the URL we're handed is checked. Libraries that follow redirects
  internally (feedparser, trafilatura) are not re-validated per hop; every fetch
  made through `open_public` validates each hop itself.
- Unresolvable hosts pass (the real fetch then fails on its own): a name that
  can't be resolved can't be connected to, so it is not an SSRF vector, and
  failing open here keeps offline / hermetic test runs working.
"""

from email.message import Message
import ipaddress
import logging
import socket
from collections.abc import Iterator
from contextlib import contextmanager
from urllib.parse import urlsplit

import httpx

logger = logging.getLogger(__name__)

_ALLOWED_SCHEMES = {"http", "https"}


class BlockedURLError(Exception):
    """Raised when a URL is not an http(s) URL to a public host (SSRF guard)."""


def _is_public_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    # An IPv4-mapped IPv6 address (::ffff:a.b.c.d) is really the embedded v4
    # address — judge it by that, or ::ffff:127.0.0.1 would slip through.
    mapped = getattr(addr, "ipv4_mapped", None)
    if mapped is not None:
        addr = mapped
    return not (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def assert_public_url(url: str) -> None:
    """Raise :class:`BlockedURLError` if *url* is not an http(s) URL to a public
    host.

    The host is resolved and *every* address it maps to (v4 and v6) must be
    global; one private/loopback/link-local/reserved address blocks the URL. A
    bare IP literal is checked directly. Hosts that fail to resolve are allowed
    through — they can't be connected to anyway.
    """
    parts = urlsplit(url)
    if parts.scheme.lower() not in _ALLOWED_SCHEMES:
        raise BlockedURLError(f"Blocked non-http(s) URL: {url!r}")
    host = parts.hostname
    if not host:
        raise BlockedURLError(f"Blocked URL with no host: {url!r}")

    port = parts.port or (443 if parts.scheme.lower() == "https" else 80)
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        return  # unresolvable → unreachable → not an SSRF vector

    for info in infos:
        ip = info[4][0]
        if not _is_public_ip(ip):
            raise BlockedURLError(f"Blocked non-public address {ip} for host {host!r}")


# Some hosts serve an empty page, or a 403, to anything that doesn't look like a
# browser.
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
# Wikimedia, among others, answers a browser User-Agent that doesn't come from a
# browser with a 403 and a pointer to its robot policy, while it serves a client
# that says what it is. Each is retried as the other.
BOT_UA = "Thothly/1.0 (https://github.com/wl2bd/thothly)"
_MAX_REDIRECTS = 5


class TooLarge(Exception):
    """The body went past the caller's byte cap."""


@contextmanager
def open_public(
    url: str, *, timeout: float, headers: dict[str, str] | None = None
) -> Iterator[httpx.Response]:
    """A streaming GET to a public host, following redirects itself so every hop
    is checked against the SSRF guard: a redirect must never bounce the server
    onto an internal address. Raises BlockedURLError or httpx.HTTPError."""
    with httpx.Client(
        follow_redirects=False,
        timeout=timeout,
        headers={"User-Agent": BROWSER_UA, **(headers or {})},
    ) as client:
        for _ in range(_MAX_REDIRECTS + 1):
            assert_public_url(url)
            with client.stream("GET", url) as response:
                location = response.headers.get("location")
                if response.is_redirect and location:
                    url = str(httpx.URL(url).join(location))
                    continue
                response.raise_for_status()
                yield response
                return
        raise httpx.TooManyRedirects(f"Too many redirects from {url}")


def read_capped(response: httpx.Response, max_bytes: int) -> bytes:
    data = bytearray()
    for chunk in response.iter_bytes():
        data += chunk
        if len(data) > max_bytes:
            raise TooLarge(f"over {max_bytes} bytes")
    return bytes(data)


def fetch_public(
    url: str, *, timeout: float, max_bytes: int, headers: dict[str, str] | None = None
) -> tuple[bytes, httpx.Headers] | None:
    """A public URL's body and headers, or None when it can't be had: blocked,
    unreachable, an error status, or over `max_bytes`."""
    first = {"User-Agent": BROWSER_UA, **(headers or {})}
    second = {**first, "User-Agent": BOT_UA if first["User-Agent"] != BOT_UA else BROWSER_UA}
    for attempt in (first, second):
        try:
            with open_public(url, timeout=timeout, headers=attempt) as response:
                return read_capped(response, max_bytes), response.headers
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 403:
                logger.info("Could not fetch %s: %s", url, exc)
                return None
        except (httpx.HTTPError, BlockedURLError, TooLarge) as exc:
            logger.info("Could not fetch %s: %s", url, exc)
            return None
    logger.info("Could not fetch %s: refused (403) whoever asked", url)
    return None


def fetch_public_text(
    url: str, *, timeout: float, max_bytes: int, headers: dict[str, str] | None = None
) -> str | None:
    """`fetch_public`, decoded with the charset the server declared (UTF-8 when
    it declares none)."""
    fetched = fetch_public(url, timeout=timeout, max_bytes=max_bytes, headers=headers)
    if fetched is None:
        return None
    data, response_headers = fetched
    content_type = Message()
    content_type["content-type"] = response_headers.get("content-type", "")
    charset = content_type.get_content_charset() or "utf-8"
    try:
        return data.decode(charset, errors="replace")
    except LookupError:
        return data.decode("utf-8", errors="replace")
