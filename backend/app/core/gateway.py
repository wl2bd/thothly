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
"""

import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings

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


@dataclass
class Route:
    """One vendor endpoint, as each gateway names it."""

    treg: str | None = None  # e.g. "exa.web.search"
    monid_provider: str | None = None  # e.g. "exa"
    monid_endpoint: str | None = None  # e.g. "/search"


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
        run = r.json()
        while run.get("status") not in _MONID_TERMINAL:
            if time.monotonic() > deadline:
                return GatewayResponse(status=504, data=None, via="monid")
            time.sleep(_MONID_POLL_S)
            run = client.get(f"{base}/v1/runs/{run['runId']}").json()

    provider_response = run.get("providerResponse") or {}
    status = provider_response.get("httpStatus")
    if run.get("status") != "COMPLETED" and not status:
        status = 502  # the run itself failed before reaching the vendor
    data = provider_response.get("data", provider_response.get("error", run.get("output")))
    return GatewayResponse(status=int(status or 200), data=data, via="monid")


def _json(r: httpx.Response) -> Any:
    try:
        return r.json()
    except ValueError:
        return None
