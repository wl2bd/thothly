from unittest.mock import patch

import pytest

from app.core.gateway import GatewayError, GatewayResponse
from app.search import exa_provider
from app.search.exa_provider import ExaProvider, exa_result, tinyfish_result


def test_exa_row_maps_highlights_to_snippet_and_date():
    r = exa_result({
        "url": "https://plato.stanford.edu/entries/stoicism/",
        "title": "Stoicism (Stanford Encyclopedia of Philosophy)",
        "publishedDate": "2023-01-20T16:34:33.000Z",
        "highlights": ["Stoicism was one of the dominant systems.", "  ", "Founded by Zeno."],
    })
    assert r.type == "web" and r.id == "web:https://plato.stanford.edu/entries/stoicism/"
    assert r.meta == {
        "snippet": "Stoicism was one of the dominant systems. … Founded by Zeno.",
        "published_at": "2023-01-20T16:34:33.000Z",
    }


def test_rows_without_url_are_dropped_and_title_falls_back_to_url():
    assert exa_result({"title": "x"}) is None
    assert tinyfish_result({"url": "https://a.example/p", "title": " "}).title == "https://a.example/p"


def _ok(data):
    return GatewayResponse(status=200, data=data, via="treg")


def test_exa_failure_falls_back_to_tinyfish():
    tf = {"results": [{"url": "https://a.example/p", "title": "A", "snippet": "s"}]}
    with patch.object(exa_provider.gateway, "call",
                      side_effect=[GatewayError("treg HTTP 402; monid HTTP 402"), _ok(tf)]) as call:
        results = ExaProvider().search("stoicism", 5, "fr-FR")
    assert [r.title for r in results] == ["A"]
    assert call.call_args_list[1].args[0] is exa_provider.TINYFISH
    assert call.call_args_list[1].kwargs["params"]["language"] == "fr"


def test_both_failing_raises_for_the_service_to_report():
    with patch.object(exa_provider.gateway, "call", side_effect=GatewayError("down")):
        with pytest.raises(RuntimeError, match="Web search failed"):
            ExaProvider().search("stoicism", 5)
