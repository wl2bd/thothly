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
  internally (feedparser, trafilatura, urllib) are not re-validated per hop; the
  podcast downloader, whose redirects we control, validates every hop itself.
- Unresolvable hosts pass (the real fetch then fails on its own): a name that
  can't be resolved can't be connected to, so it is not an SSRF vector, and
  failing open here keeps offline / hermetic test runs working.
"""

import ipaddress
import socket
from urllib.parse import urlsplit

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
