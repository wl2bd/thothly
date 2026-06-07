from unittest.mock import patch

from fastapi.testclient import TestClient

from app.jobs import repository
from app.jobs.models import DiscoveredItemResponse

VALID_SOURCE = {"url": "https://youtube.com/playlist?list=PLtest123"}


@patch("app.jobs.router.run_discovery")
def test_create_job_returns_201_and_discovering(mock_discovery, client: TestClient) -> None:
    resp = client.post("/jobs", json={"sources": [VALID_SOURCE]})
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "discovering"
    assert "id" in body
    assert len(body["sources"]) == 1
    mock_discovery.assert_called_once()


@patch("app.jobs.router.run_discovery")
def test_get_job_returns_created_job(mock_discovery, client: TestClient) -> None:
    job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]
    resp = client.get(f"/jobs/{job_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == job_id
    assert resp.json()["status"] == "discovering"


def test_get_job_unknown_id_returns_404(client: TestClient) -> None:
    resp = client.get("/jobs/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_create_job_invalid_url_returns_422(client: TestClient) -> None:
    resp = client.post("/jobs", json={"sources": [{"url": "not-a-valid-url"}]})
    assert resp.status_code == 422


def test_create_job_empty_sources_returns_422(client: TestClient) -> None:
    resp = client.post("/jobs", json={"sources": []})
    assert resp.status_code == 422


@patch("app.jobs.router.run_discovery")
def test_create_job_multiple_sources(mock_discovery, client: TestClient) -> None:
    sources = [
        {"url": "https://youtube.com/playlist?list=PLtest"},
        {"url": "https://example.com/feed.xml"},
    ]
    resp = client.post("/jobs", json={"sources": sources})
    assert resp.status_code == 201
    assert len(resp.json()["sources"]) == 2


@patch("app.jobs.router.run_compilation")
@patch("app.jobs.router.run_discovery")
def test_confirm_selects_items_and_starts_processing(
    mock_discovery, mock_compilation, client: TestClient
) -> None:
    job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]

    # Simulate the discovery phase result, then move the job to review.
    item = DiscoveredItemResponse(
        id="item-1", source_index=0, item_index=0, item_type="youtube",
        title="A video", url="https://www.youtube.com/watch?v=abc123",
    )
    repository.save_discovered_items(job_id, [item])
    repository.update_job_status(job_id, "reviewing")

    reviewing = client.get(f"/jobs/{job_id}").json()
    assert reviewing["status"] == "reviewing"
    assert len(reviewing["discovered_items"]) == 1

    resp = client.post(f"/jobs/{job_id}/confirm", json={"selected_ids": ["item-1"]})
    assert resp.status_code == 200
    assert resp.json()["status"] == "processing"
    mock_compilation.assert_called_once()


@patch("app.jobs.router.run_discovery")
def test_transcript_metadata_roundtrip_and_api_exclusion(
    mock_discovery, client: TestClient
) -> None:
    job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]
    item = DiscoveredItemResponse(
        id="item-1", source_index=0, item_index=0, item_type="youtube",
        title="A video", url="https://www.youtube.com/watch?v=abc123",
        has_transcript=True, transcript_lang="fr", is_punctuated=False,
        word_count=1200, reading_time_min=6,
        transcript_segments=["hello", "world"],
    )
    repository.save_discovered_items(job_id, [item])
    repository.update_job_status(job_id, "reviewing")

    # Review metadata is persisted and exposed to the client...
    api_item = client.get(f"/jobs/{job_id}").json()["discovered_items"][0]
    assert api_item["has_transcript"] is True
    assert api_item["transcript_lang"] == "fr"
    assert api_item["is_punctuated"] is False
    assert api_item["word_count"] == 1200
    assert api_item["reading_time_min"] == 6
    # ...but the cached transcript itself never leaks over the API.
    assert "transcript_segments" not in api_item

    # The compile path, however, reads the cached transcript back.
    repository.confirm_items(job_id, ["item-1"])
    selected = repository.get_selected_items(job_id)
    assert selected[0].transcript_segments == ["hello", "world"]


@patch("app.jobs.router.run_discovery")
def test_confirm_requires_reviewing_status(mock_discovery, client: TestClient) -> None:
    job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]
    resp = client.post(f"/jobs/{job_id}/confirm", json={"selected_ids": ["x"]})
    assert resp.status_code == 409


@patch("app.jobs.router.run_discovery")
def test_download_returns_409_when_not_completed(mock_discovery, client: TestClient) -> None:
    job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]
    resp = client.get(f"/jobs/{job_id}/download")
    assert resp.status_code == 409
