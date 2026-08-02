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
def test_transcript_metadata_roundtrip(mock_discovery, client: TestClient) -> None:
    job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]
    item = DiscoveredItemResponse(
        id="item-1", source_index=0, item_index=0, item_type="youtube",
        title="A video", url="https://www.youtube.com/watch?v=abc123",
        has_transcript=True, transcript_lang="fr", is_punctuated=False,
        word_count=1200, reading_time_min=6,
    )
    repository.save_discovered_items(job_id, [item])
    repository.update_job_status(job_id, "reviewing")

    api_item = client.get(f"/jobs/{job_id}").json()["discovered_items"][0]
    assert api_item["has_transcript"] is True
    assert api_item["transcript_lang"] == "fr"
    assert api_item["is_punctuated"] is False
    assert api_item["word_count"] == 1200
    assert api_item["reading_time_min"] == 6


@patch("app.jobs.phases.discover_source")
def test_run_discovery_records_per_source_progress(mock_discover, client: TestClient) -> None:
    """The real discovery phase writes each source's name + item tally back as it
    resolves, so the loading screen can show live per-source progress."""
    from app.jobs.models import JobCreate, Source
    from app.jobs.phases import run_discovery
    from app.sources.discovery import DiscoveredItem

    def fake_discover(url, index, **kwargs):
        n = 1 if index == 0 else 3
        items = [
            DiscoveredItem(
                title=f"item {index}-{j}", url=f"{url}#{j}",
                item_type="youtube", source_index=index, item_index=j,
            )
            for j in range(n)
        ]
        return (f"Source {index}", items)

    mock_discover.side_effect = fake_discover

    sources = [
        Source(url="https://www.youtube.com/watch?v=abc123"),
        Source(url="https://youtube.com/playlist?list=PLtest"),
    ]
    job = repository.create_job(JobCreate(sources=sources))
    run_discovery(job.id, sources)

    result = repository.get_job(job.id)
    assert result is not None
    assert result.status == "reviewing"
    assert [s.resolved for s in result.sources] == [True, True]
    assert [s.item_count for s in result.sources] == [1, 3]
    assert [s.name for s in result.sources] == ["Source 0", "Source 1"]
    assert len(result.discovered_items) == 4


@patch("app.jobs.router.run_compilation")
@patch("app.jobs.router.run_discovery")
def test_confirm_overrides_book_title(
    mock_discovery, mock_compilation, client: TestClient
) -> None:
    job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]
    item = DiscoveredItemResponse(
        id="item-1", source_index=0, item_index=0, item_type="youtube",
        title="A video", url="https://www.youtube.com/watch?v=abc123",
    )
    repository.save_discovered_items(job_id, [item])
    repository.update_job_status(job_id, "reviewing", book_title="Default Name")

    resp = client.post(
        f"/jobs/{job_id}/confirm",
        json={"selected_ids": ["item-1"], "book_title": "  My Custom Title  "},
    )
    assert resp.status_code == 200
    assert resp.json()["book_title"] == "My Custom Title"  # trimmed, overridden


@patch("app.jobs.router.run_compilation")
@patch("app.jobs.router.run_discovery")
def test_confirm_blank_title_keeps_default(
    mock_discovery, mock_compilation, client: TestClient
) -> None:
    job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]
    item = DiscoveredItemResponse(
        id="item-1", source_index=0, item_index=0, item_type="youtube",
        title="A video", url="https://www.youtube.com/watch?v=abc123",
    )
    repository.save_discovered_items(job_id, [item])
    repository.update_job_status(job_id, "reviewing", book_title="Default Name")

    resp = client.post(
        f"/jobs/{job_id}/confirm",
        json={"selected_ids": ["item-1"], "book_title": "   "},
    )
    assert resp.json()["book_title"] == "Default Name"  # blank -> keep default


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


def test_set_item_compile_state_roundtrips(client: TestClient) -> None:
    """One item's outcome is written and read back on its own, without touching
    its neighbour: the runner advances items one at a time."""
    from app.jobs.models import JobCreate, Source

    job = repository.create_job(
        JobCreate(sources=[Source(url="https://example.com/feed.xml")])
    )
    items = [
        DiscoveredItemResponse(
            id=f"item-{i}", source_index=0, item_index=i, item_type="youtube",
            title=f"Video {i}", url=f"https://www.youtube.com/watch?v=vid{i}",
        )
        for i in range(2)
    ]
    repository.save_discovered_items(job.id, items)

    # A fresh item carries no outcome at all.
    assert repository.get_discovered_item(job.id, "item-0").compile_state is None

    repository.set_item_compile_state(job.id, "item-0", "compiling")
    assert repository.get_discovered_item(job.id, "item-0").compile_state == "compiling"

    repository.set_item_compile_state(
        job.id, "item-0", "skipped", "No subtitles available."
    )
    first = repository.get_discovered_item(job.id, "item-0")
    assert first.compile_state == "skipped"
    assert first.compile_note == "No subtitles available."

    # A later transition clears the reason (it belonged to the previous state).
    repository.set_item_compile_state(job.id, "item-0", "done")
    first = repository.get_discovered_item(job.id, "item-0")
    assert first.compile_state == "done"
    assert first.compile_note is None

    # The neighbour was never touched.
    assert repository.get_discovered_item(job.id, "item-1").compile_state is None


@patch("app.jobs.router.run_compilation")
@patch("app.jobs.router.run_discovery")
def test_processing_job_exposes_only_the_confirmed_items(
    mock_discovery, mock_compilation, client: TestClient
) -> None:
    """The compile screen needs the items to draw progress against, in the order
    they will be compiled — and only the ones the user actually picked."""
    job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]
    items = [
        DiscoveredItemResponse(
            id=f"item-{i}", source_index=0, item_index=i, item_type="youtube",
            title=f"Video {i}", url=f"https://www.youtube.com/watch?v=vid{i}",
        )
        for i in range(3)
    ]
    repository.save_discovered_items(job_id, items)
    repository.update_job_status(job_id, "reviewing")

    # Two of the three, in reverse order (the review screen can reorder).
    client.post(f"/jobs/{job_id}/confirm", json={"selected_ids": ["item-2", "item-0"]})

    body = client.get(f"/jobs/{job_id}").json()
    assert body["status"] == "processing"
    assert [it["id"] for it in body["discovered_items"]] == ["item-2", "item-0"]
    assert [it["compile_state"] for it in body["discovered_items"]] == [
        "pending",
        "pending",
    ]

    # And they stay visible once it's over, so the finished screen can report
    # what was left out.
    repository.set_item_compile_state(job_id, "item-0", "skipped", "No subtitles available.")
    repository.set_item_compile_state(job_id, "item-2", "done")
    repository.update_job_status(job_id, "completed")

    done = client.get(f"/jobs/{job_id}").json()
    assert [it["compile_state"] for it in done["discovered_items"]] == ["done", "skipped"]
    assert done["discovered_items"][1]["compile_note"] == "No subtitles available."


@patch("app.jobs.router.run_discovery")
def test_get_job_exposes_confirmed_items_when_failed(
    mock_discovery, client: TestClient
) -> None:
    """`failed` is exactly the state where every item was written off, so it's
    the state where the per-item reasons matter most — hiding the item list here
    would bury every compile_note the runner just wrote."""
    job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]
    items = [
        DiscoveredItemResponse(
            id=f"item-{i}", source_index=0, item_index=i, item_type="youtube",
            title=f"Video {i}", url=f"https://www.youtube.com/watch?v=vid{i}",
        )
        for i in range(2)
    ]
    repository.save_discovered_items(job_id, items)
    repository.confirm_items(job_id, ["item-0", "item-1"])
    repository.set_item_compile_state(
        job_id, "item-0", "skipped", "No subtitles available."
    )
    repository.set_item_compile_state(
        job_id, "item-1", "failed", "This item could not be built."
    )
    repository.update_job_status(
        job_id,
        "failed",
        error="None of the selected items could be built. Try again, or pick different sources.",
    )

    body = client.get(f"/jobs/{job_id}").json()
    assert body["status"] == "failed"
    assert [it["id"] for it in body["discovered_items"]] == ["item-0", "item-1"]
    assert [it["compile_state"] for it in body["discovered_items"]] == [
        "skipped",
        "failed",
    ]
    assert body["discovered_items"][0]["compile_note"] == "No subtitles available."
    assert body["discovered_items"][1]["compile_note"] == "This item could not be built."


@patch("app.jobs.router.run_discovery")
def test_get_job_failed_during_discovery_has_no_items(
    mock_discovery, client: TestClient
) -> None:
    """A job that never reached review has nothing selected — exposing items for
    `failed` must not invent a special case for that: it just comes back empty."""
    job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]
    repository.update_job_status(job_id, "failed", error="Discovery failed.")

    body = client.get(f"/jobs/{job_id}").json()
    assert body["status"] == "failed"
    assert body["discovered_items"] == []


def test_confirm_items_clears_the_previous_compile_outcome(client: TestClient) -> None:
    """Confirming starts a compile from a clean slate: an earlier run's per-item
    outcome must never show up as this run's progress."""
    from app.jobs.models import JobCreate, Source

    job = repository.create_job(
        JobCreate(sources=[Source(url="https://example.com/feed.xml")])
    )
    items = [
        DiscoveredItemResponse(
            id=f"item-{i}", source_index=0, item_index=i, item_type="youtube",
            title=f"Video {i}", url=f"https://www.youtube.com/watch?v=vid{i}",
        )
        for i in range(2)
    ]
    repository.save_discovered_items(job.id, items)

    repository.confirm_items(job.id, ["item-0", "item-1"])
    repository.set_item_compile_state(job.id, "item-0", "done")
    repository.set_item_compile_state(
        job.id, "item-1", "skipped", "No subtitles available."
    )

    again = repository.confirm_items(job.id, ["item-1"])
    assert [it.compile_state for it in again] == ["pending"]
    assert again[0].compile_note is None

    # The item dropped from the selection keeps no trace of the previous run.
    dropped = repository.get_discovered_item(job.id, "item-0")
    assert dropped.compile_state is None
    assert dropped.compile_note is None
