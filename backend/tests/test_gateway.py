from unittest.mock import patch

import httpx
import pytest

from app.core import gateway
from app.core.gateway import GatewayError, GatewayResponse, Route

ROUTE = Route(treg="exa.web.search", monid_provider="exa", monid_endpoint="/search")


@pytest.fixture
def both(monkeypatch):
    monkeypatch.setattr(gateway.settings, "treg_token", "t")
    monkeypatch.setattr(gateway.settings, "monid_api_key", "m")


def _resp(status, via, data=None):
    return GatewayResponse(status=status, data=data if data is not None else {"ok": via}, via=via)


def test_treg_answer_is_used(both):
    with patch.object(gateway, "_call_treg", return_value=_resp(200, "treg")) as t, \
         patch.object(gateway, "_call_monid") as m:
        assert gateway.call(ROUTE, body={"q": 1}).via == "treg"
    t.assert_called_once()
    m.assert_not_called()


@pytest.mark.parametrize("status", [402, 429, 503])
def test_treg_outage_falls_back_to_monid(both, status):
    with patch.object(gateway, "_call_treg", return_value=_resp(status, "treg")), \
         patch.object(gateway, "_call_monid", return_value=_resp(200, "monid")) as m:
        assert gateway.call(ROUTE, body={"q": 1}).via == "monid"
    assert m.call_args.args[:2] == ("exa", "/search")


def test_treg_unreachable_falls_back(both):
    with patch.object(gateway, "_call_treg", side_effect=httpx.ConnectError("down")), \
         patch.object(gateway, "_call_monid", return_value=_resp(200, "monid")):
        assert gateway.call(ROUTE).via == "monid"


def test_vendor_404_is_an_answer_not_an_outage(both):
    with patch.object(gateway, "_call_treg", return_value=_resp(404, "treg", {})), \
         patch.object(gateway, "_call_monid") as m:
        assert gateway.call(ROUTE).status == 404
    m.assert_not_called()


def test_route_without_monid_name_raises_on_treg_outage(both):
    with patch.object(gateway, "_call_treg", return_value=_resp(402, "treg")), \
         patch.object(gateway, "_call_monid") as m:
        with pytest.raises(GatewayError, match="402"):
            gateway.call(Route(treg="scrapecreators.youtube.video.detail"))
    m.assert_not_called()


def test_monid_only(monkeypatch):
    monkeypatch.setattr(gateway.settings, "treg_token", None)
    monkeypatch.setattr(gateway.settings, "monid_api_key", "m")
    with patch.object(gateway, "_call_treg") as t, \
         patch.object(gateway, "_call_monid", return_value=_resp(200, "monid")):
        assert gateway.call(ROUTE).via == "monid"
    t.assert_not_called()


def test_nothing_configured(monkeypatch):
    monkeypatch.setattr(gateway.settings, "treg_token", None)
    monkeypatch.setattr(gateway.settings, "monid_api_key", None)
    assert not gateway.available()
    with pytest.raises(GatewayError, match="no data gateway"):
        gateway.call(ROUTE)


def test_monid_run_unwraps_provider_response(monkeypatch):
    monkeypatch.setattr(gateway.settings, "monid_api_key", "m")
    monkeypatch.setattr(gateway, "_MONID_POLL_S", 0)
    calls = []

    def handler(request: httpx.Request):
        calls.append((request.method, request.url.path))
        if request.method == "POST":
            return httpx.Response(200, json={"runId": "r1", "status": "RUNNING"})
        return httpx.Response(200, json={
            "runId": "r1", "status": "COMPLETED",
            "providerResponse": {"httpStatus": 200, "data": {"results": [1, 2]}},
        })

    real_client = httpx.Client
    with patch.object(gateway.httpx, "Client",
                      lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)):
        r = gateway._call_monid("exa", "/search", None, {"query": "x"}, 5)
    assert (r.status, r.data, r.via) == (200, {"results": [1, 2]}, "monid")
    assert calls == [("POST", "/v1/run"), ("GET", "/v1/runs/r1")]


def test_monid_run_without_run_id_is_a_failed_call(monkeypatch):
    monkeypatch.setattr(gateway.settings, "monid_api_key", "m")
    real_client = httpx.Client
    handler = lambda request: httpx.Response(200, json={"error": {"message": "nope"}})
    with patch.object(gateway.httpx, "Client",
                      lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)):
        assert gateway._call_monid("exa", "/search", None, {}, 5).status == 502


# --- Response cache: a paid answer is bought once per TTL ----------------------
CACHED = Route(treg="scrapecreators.youtube.video.detail", cache_ttl_s=3600)


def test_cached_route_pays_once_for_the_same_call(both):
    with patch.object(gateway, "_call_treg", return_value=_resp(200, "treg", {"id": "a"})) as t:
        first = gateway.call(CACHED, params={"url": "u"})
        second = gateway.call(CACHED, params={"url": "u"})
    t.assert_called_once()
    assert (first.cached, second.cached) == (False, True)
    assert second.data == {"id": "a"} and second.status == 200


def test_cache_key_is_the_whole_request(both):
    with patch.object(gateway, "_call_treg", return_value=_resp(200, "treg")) as t:
        gateway.call(CACHED, params={"url": "u"})
        gateway.call(CACHED, params={"url": "other"})
        gateway.call(Route(treg="scrapecreators.x.v1-youtube-video-transcript", cache_ttl_s=3600),
                     params={"url": "u"})
    assert t.call_count == 3


def test_vendor_404_is_cached_too(both):
    with patch.object(gateway, "_call_treg", return_value=_resp(404, "treg", {})) as t:
        gateway.call(CACHED, params={"url": "gone"})
        assert gateway.call(CACHED, params={"url": "gone"}).status == 404
    t.assert_called_once()


def test_outage_is_never_cached(both):
    with patch.object(gateway, "_call_treg", return_value=_resp(429, "treg")), \
         patch.object(gateway, "_call_monid", return_value=_resp(503, "monid")):
        with pytest.raises(GatewayError):
            gateway.call(CACHED, params={"url": "u"})
    with patch.object(gateway, "_call_treg", return_value=_resp(200, "treg")) as t:
        assert gateway.call(CACHED, params={"url": "u"}).cached is False
    t.assert_called_once()


def test_expired_entry_is_bought_again(both, monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(gateway.time, "time", lambda: clock[0])
    with patch.object(gateway, "_call_treg", return_value=_resp(200, "treg")) as t:
        gateway.call(CACHED, params={"url": "u"})
        clock[0] += 3599
        gateway.call(CACHED, params={"url": "u"})
        clock[0] += 2
        gateway.call(CACHED, params={"url": "u"})
    assert t.call_count == 2


def test_route_without_ttl_is_not_cached(both):
    with patch.object(gateway, "_call_treg", return_value=_resp(200, "treg")) as t:
        gateway.call(ROUTE, body={"q": 1})
        gateway.call(ROUTE, body={"q": 1})
    assert t.call_count == 2
