"""Paid data APIs through one door: treg first, Monid when treg can't answer.

treg (https://treg.to) and Monid (https://monid.ai) are both pay-per-call
catalogues that hold the vendors' keys, so the server keeps one token each
instead of an account per vendor. treg is the default. Monid is the fallback for
the moments treg can't serve a call: unreachable, out of balance (402), rate
limited (429) or failing upstream (5xx). A vendor answer such as 404 is an
answer, not an outage, so it never triggers the fallback.

The same vendor endpoint is named differently on each side (treg:
`exa.web.search`, Monid: provider `exa` + endpoint `/search`), so a caller passes
both names. A call with no Monid name only goes through treg.

A route with `cache_ttl_s` keeps each vendor answer (200 or 404) in SQLite for
that long, keyed by the whole request, so the same paid call is bought once per
TTL however many code paths ask for it. Outages are never kept.
"""

import hashlib
import json
import logging
import sqlite3
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings
from app.core.database import get_connection

logger = logging.getLogger(__name__)

# Statuses that mean "this gateway can't serve the call right now", worth
# retrying on the other one. Anything else is the vendor's own answer.
_RETRYABLE = {402, 408, 425, 429, 500, 502, 503, 504}
_MONID_POLL_S = 0.5
_MONID_TERMINAL = {"COMPLETED", "FAILED", "BLOCKED", "STOPPED", "TIMED_OUT"}


class GatewayError(RuntimeError):
    """No gateway could serve the call (none configured, or all failed)."""


@dataclass
class GatewayResponse:
    status: int
    data: Any
    via: str  # "treg" or "monid", for logs and analytics
    cached: bool = False  # served from the response cache: nothing was billed


@dataclass
class Route:
    """One vendor endpoint, as each gateway names it."""

    treg: str | None = None  # e.g. "exa.web.search"
    monid_provider: str | None = None  # e.g. "exa"
    monid_endpoint: str | None = None  # e.g. "/search"
    cache_ttl_s: float | None = None  # keep answers this long; None = never cache


def available(route: Route | None = None) -> bool:
    """True when at least one gateway is configured (for this route, if given)."""
    treg = bool(settings.treg_token) and (route is None or route.treg is not None)
    monid = bool(settings.monid_api_key) and (route is None or route.monid_provider is not None)
    return treg or monid


def call(
    route: Route,
    *,
    params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
    timeout: float = 30.0,
) -> GatewayResponse:
    """Call one vendor endpoint. `params` go in the query string, `body` as JSON
    (and makes the call a POST). Raises GatewayError when nothing could serve it."""
    key = _cache_key(route, params, body) if route.cache_ttl_s else None
    if key:
        hit = _cache_get(key, route.cache_ttl_s)
        if hit is not None:
            return hit
    response = _call_uncached(route, params, body, timeout)
    if key and response.status in _CACHEABLE:
        _cache_put(key, response)
    return response


def _call_uncached(route: Route, params, body, timeout: float) -> GatewayResponse:
    errors: list[str] = []
    if settings.treg_token and route.treg:
        try:
            response = _call_treg(route.treg, params, body, timeout)
            if response.status not in _RETRYABLE:
                return response
            errors.append(f"treg HTTP {response.status}")
        except httpx.HTTPError as exc:
            errors.append(f"treg unreachable: {exc}")
    if settings.monid_api_key and route.monid_provider and route.monid_endpoint:
        if errors:
            logger.warning("treg failed for %s (%s), falling back to Monid", route.treg, errors[-1])
        try:
            response = _call_monid(route.monid_provider, route.monid_endpoint, params, body, timeout)
            if response.status not in _RETRYABLE:
                return response
            errors.append(f"monid HTTP {response.status}")
        except (httpx.HTTPError, ValueError) as exc:
            errors.append(f"monid failed: {exc}")
    raise GatewayError("; ".join(errors) or "no data gateway configured (TREG_TOKEN or MONID_API_KEY)")


def _call_treg(endpoint: str, params, body, timeout: float) -> GatewayResponse:
    url = f"{settings.treg_base_url}/{endpoint}"
    headers = {"X-Treg-Token": settings.treg_token or ""}
    if body is not None:
        r = httpx.post(url, params=params, json=body, headers=headers, timeout=timeout)
    else:
        r = httpx.get(url, params=params, headers=headers, timeout=timeout)
    return GatewayResponse(status=r.status_code, data=_json(r), via="treg")


def _call_monid(provider: str, endpoint: str, params, body, timeout: float) -> GatewayResponse:
    """Monid runs a call as a job: POST /v1/run, then poll /v1/runs/{id} until
    it's terminal. The vendor's own status and body sit under providerResponse."""
    base = settings.monid_base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {settings.monid_api_key}"}
    run_input: dict[str, Any] = {}
    if body is not None:
        run_input["body"] = body
    if params:
        run_input["queryParams"] = params
    payload: dict[str, Any] = {"provider": provider, "endpoint": endpoint}
    if run_input:
        payload["input"] = run_input

    deadline = time.monotonic() + timeout
    with httpx.Client(headers=headers, timeout=timeout) as client:
        r = client.post(f"{base}/v1/run", json=payload)
        if r.status_code != 200 and r.status_code != 201 and r.status_code != 202:
            return GatewayResponse(status=r.status_code, data=_json(r), via="monid")
        run = _json(r)
        run_id = run.get("runId") if isinstance(run, dict) else None
        if not run_id:
            return GatewayResponse(status=502, data=run, via="monid")
        while run.get("status") not in _MONID_TERMINAL:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return GatewayResponse(status=504, data=None, via="monid")
            time.sleep(min(_MONID_POLL_S, remaining))
            polled = _json(client.get(f"{base}/v1/runs/{run_id}", timeout=max(remaining, 1.0)))
            if isinstance(polled, dict):
                run = polled

    provider_response = run.get("providerResponse") or {}
    status = provider_response.get("httpStatus")
    if run.get("status") != "COMPLETED" and not status:
        status = 502  # the run itself failed before reaching the vendor
    data = provider_response.get("data", provider_response.get("error", run.get("output")))
    return GatewayResponse(status=int(status or 200), data=data, via="monid")


# --- Response cache (gateway_cache) --------------------------------------------
# TTLs the routes use. Searches go stale; a video's tracks and a transcript don't.
SEARCH_TTL_S = 6 * 3600.0
DETAIL_TTL_S = 7 * 86400.0
TRANSCRIPT_TTL_S = 30 * 86400.0
_CACHEABLE = {200, 404}  # vendor answers; anything else reached here is not one


def _cache_key(route: Route, params, body) -> str:
    request = [route.treg, route.monid_provider, route.monid_endpoint, params or {}, body or {}]
    return hashlib.sha256(json.dumps(request, sort_keys=True, default=str).encode()).hexdigest()


def _cache_get(key: str, ttl_s: float) -> GatewayResponse | None:
    # A broken cache must never block a call: it just pays, as before.
    try:
        with get_connection() as conn:
            row = conn.execute(
                "SELECT status, data, via, stored_at FROM gateway_cache WHERE key = ?", (key,)
            ).fetchone()
    except sqlite3.Error as exc:
        logger.warning("gateway cache read failed: %s", exc)
        return None
    if row is None or time.time() - row["stored_at"] >= ttl_s:
        return None
    return GatewayResponse(status=row["status"], data=json.loads(row["data"]), via=row["via"], cached=True)


def _cache_put(key: str, response: GatewayResponse) -> None:
    try:
        with get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO gateway_cache (key, status, data, via, stored_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (key, response.status, json.dumps(response.data), response.via, time.time()),
            )
            conn.commit()
    except (sqlite3.Error, TypeError, ValueError) as exc:
        logger.warning("gateway cache write failed: %s", exc)


def _json(r: httpx.Response) -> Any:
    try:
        return r.json()
    except ValueError:
        return None
