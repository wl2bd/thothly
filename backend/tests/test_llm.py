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
    ids = {r["id"] for r in data["roles"]}
    assert {"punctuate", "copyedit", "sections", "preface"} <= ids


def test_selected_item_roles_order_and_scope() -> None:
    # Book-scoped roles (preface) are excluded; item roles keep canonical order.
    roles = selected_item_roles(["preface", "sections", "punctuate", "copyedit"])
    assert [r.id for r in roles] == ["punctuate", "copyedit", "sections"]


def test_all_roles_have_metadata() -> None:
    for role in ROLES:
        assert role.id and role.label and role.description
        assert role.scope in ("item", "book")
        assert role.system_prompt


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
