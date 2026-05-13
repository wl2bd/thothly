from fastapi.testclient import TestClient

VALID_SOURCE = {"type": "youtube_playlist", "url": "https://youtube.com/playlist?list=PLtest123"}


def test_create_job_returns_201(client: TestClient) -> None:
    resp = client.post("/jobs", json={"sources": [VALID_SOURCE]})
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "pending"
    assert "id" in body
    assert len(body["sources"]) == 1


def test_get_job_returns_created_job(client: TestClient) -> None:
    job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]
    resp = client.get(f"/jobs/{job_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == job_id
    assert resp.json()["status"] == "pending"


def test_get_job_unknown_id_returns_404(client: TestClient) -> None:
    resp = client.get("/jobs/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_create_job_invalid_source_type_returns_422(client: TestClient) -> None:
    resp = client.post("/jobs", json={"sources": [{"type": "podcasts", "url": "https://example.com"}]})
    assert resp.status_code == 422


def test_create_job_empty_sources_returns_422(client: TestClient) -> None:
    resp = client.post("/jobs", json={"sources": []})
    assert resp.status_code == 422


def test_create_job_multiple_sources(client: TestClient) -> None:
    sources = [
        {"type": "youtube_playlist", "url": "https://youtube.com/playlist?list=PLtest"},
        {"type": "blog_rss", "url": "https://example.com/feed.xml"},
    ]
    resp = client.post("/jobs", json={"sources": sources})
    assert resp.status_code == 201
    assert len(resp.json()["sources"]) == 2
