from unittest.mock import patch

from fastapi.testclient import TestClient

from app.jobs import repository
from app.jobs.models import DiscoveredItemResponse
from app.pipeline.roles import ROLES, selected_item_roles

VALID_SOURCE = {"url": "https://youtube.com/playlist?list=PLtest123"}


def test_llm_endpoint_lists_roles_and_unavailable(client: TestClient) -> None:
    resp = client.get("/llm")
    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is False  # no LLM configured in the test env
    assert data["stt_available"] is False
    ids = {r["id"] for r in data["roles"]}
    assert {"punctuate", "copyedit", "sections", "preface"} <= ids
    # Pricing is surfaced for the review screen's cost estimate.
    assert {"stt_per_minute", "llm_per_mtok_in", "llm_per_mtok_out"} <= data["pricing"].keys()


def test_selected_item_roles_order_and_scope() -> None:
    # Book-scoped roles (preface) are excluded; item roles keep canonical order.
    roles = selected_item_roles(["preface", "sections", "punctuate", "copyedit"])
    assert [r.id for r in roles] == ["punctuate", "copyedit", "sections"]


@patch("app.jobs.router.run_compilation")
@patch("app.jobs.router.run_discovery")
def test_confirm_stores_known_roles_and_drops_unknown(
    mock_discovery, mock_compilation, client: TestClient
) -> None:
    job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]
    item = DiscoveredItemResponse(
        id="item-1", source_index=0, item_index=0, item_type="youtube",
        title="A video", url="https://www.youtube.com/watch?v=abc123",
    )
    repository.save_discovered_items(job_id, [item])
    repository.update_job_status(job_id, "reviewing")

    resp = client.post(
        f"/jobs/{job_id}/confirm",
        json={"selected_ids": ["item-1"], "llm_roles": ["punctuate", "bogus"]},
    )
    assert resp.status_code == 200
    # Unknown role ids are filtered out before storage.
    assert repository.get_job_llm_roles(job_id) == ["punctuate"]


@patch("app.jobs.router.run_compilation")
@patch("app.jobs.router.run_discovery")
def test_confirm_defaults_to_no_roles(
    mock_discovery, mock_compilation, client: TestClient
) -> None:
    job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]
    item = DiscoveredItemResponse(
        id="item-1", source_index=0, item_index=0, item_type="youtube",
        title="A video", url="https://www.youtube.com/watch?v=abc123",
    )
    repository.save_discovered_items(job_id, [item])
    repository.update_job_status(job_id, "reviewing")

    client.post(f"/jobs/{job_id}/confirm", json={"selected_ids": ["item-1"]})
    assert repository.get_job_llm_roles(job_id) == []


def _completion(cost: float | None):
    from types import SimpleNamespace

    usage = SimpleNamespace(model_extra={"cost": cost} if cost is not None else {})
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=" ok "))], usage=usage)


def test_reasoning_is_switched_off_on_openrouter_only() -> None:
    from app.pipeline.llm import extra_body
    from app.pipeline.providers import Endpoint

    assert extra_body(Endpoint("https://openrouter.ai/api/v1", "m")) == {"reasoning": {"enabled": False}}
    # Any other provider would reject the unknown field.
    assert extra_body(Endpoint("https://api.mistral.ai/v1", "m")) == {}
    assert extra_body(Endpoint("http://localhost:11434/v1", "m")) == {}


def test_cost_is_recorded_for_the_server_key_only(monkeypatch) -> None:
    from unittest.mock import MagicMock

    from app.pipeline import llm
    from app.pipeline.providers import Endpoint

    monkeypatch.setattr(llm.settings, "llm_base_url", "https://openrouter.ai/api/v1")
    monkeypatch.setattr(llm.settings, "llm_model", "deepseek/deepseek-v4.1-flash")
    client = MagicMock()
    client.chat.completions.create.return_value = _completion(0.0007)
    with patch.object(llm, "_client", return_value=client), patch.object(llm, "capture_paid_call") as paid:
        assert llm.complete("s", "u") == "ok"
        paid.assert_called_once_with("openrouter", "llm", 0.0007)
        paid.reset_mock()
        # A visitor's own key: their spend, not the operator's.
        llm.complete("s", "u", endpoint=Endpoint("https://openrouter.ai/api/v1", "m", "visitor"))
        paid.assert_not_called()
