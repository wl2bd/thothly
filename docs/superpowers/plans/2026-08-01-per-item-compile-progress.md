# Per-Item Compile Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the compile phase from one opaque spinner into a live per-item list, and stop silently dropping items the user selected.

**Architecture:** Two new columns on `job_discovered_items` (`compile_state`, `compile_note`) carry each item's outcome through the existing SQLite migration mechanism. The runner writes one `UPDATE` per transition as it works the confirmed list; `get_job` starts returning the selected items during `processing`/`completed` so the 2s poll the frontend already runs picks them up. Chapter builders stop returning `None` and raise `ItemSkipped(reason)` instead, so a reason exists for every item that doesn't make it, and one broken item can no longer kill the whole job. The final "Building the file" step is deduced client-side from "every item is terminal" — exact by construction, no extra write.

**Tech Stack:** FastAPI + SQLite (stdlib `sqlite3`) + Pydantic v2 on the backend, pytest for tests; Next.js 16 + React + Tailwind v4 on the frontend.

## Global Constraints

- **Copy is English**, everywhere in the UI. Ingested content keeps its source language; chrome does not.
- **No em-dashes (—) in user-facing copy.** Use a period, a comma, or a new sentence.
- **Never expose "LLM"** in user-facing copy. The optional paid path is called "AI polish".
- User-facing reasons are **factual-neutral**: no "⚠️", no blame, no exclamation.
- The deliverable is a **"compilation"**, not "an EPUB". EPUB and Markdown are formats it comes in.
- **Comments explain WHY, not what.** This codebase's existing comments are long-form rationale; match that density and voice or the file will read as two authors.
- **No new dependencies**, backend or frontend.
- Frontend is **Next.js 16** with breaking changes vs. training data. Read `frontend/node_modules/next/dist/docs/` before writing frontend code (see `frontend/AGENTS.md`).
- Backend tests: `cd backend && uv run pytest`. Frontend checks: `cd frontend && pnpm lint` and `pnpm build`.
- Work directly on `main`. Commit after every task.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `backend/app/core/database.py` | SQLite schema + in-place column migrations | Modify: two columns on `job_discovered_items` |
| `backend/app/jobs/models.py` | Pydantic wire models | Modify: `CompileState` type + two fields on `DiscoveredItemResponse` |
| `backend/app/jobs/repository.py` | All SQL for jobs and their items | Modify: read the new columns, write one transition, reset on confirm, expose items during processing/completed |
| `backend/app/jobs/runner.py` | The compile phase | Modify: `ItemSkipped`, reason constants, builders raise, loop isolates failures and records state |
| `backend/tests/test_jobs.py` | API + repository behaviour | Modify: item visibility per status, confirm reset |
| `backend/tests/test_runner.py` | Compile phase behaviour | Modify: builder raises, skip/fail isolation, state progression, zero-survivor |
| `frontend/lib/api.ts` | Backend wire types | Modify: `CompileState` + two fields on `DiscoveredItem` |
| `frontend/app/jobs/[id]/page.tsx` | The whole job screen | Modify: `CompilingView` + `CompileStep` replace the bare spinner; `LeftOutNotice` in `CompletedView` |

---

### Task 1: Persist a per-item compile outcome

Two columns and the read/write path for them. Nothing uses them yet — this task exists on its own so the storage layer can be reviewed and tested without the runner's control flow in the way.

**Files:**
- Modify: `backend/app/core/database.py:91-100` (`_DISCOVERED_ITEM_ADDED_COLUMNS`)
- Modify: `backend/app/jobs/models.py:6-15` (type aliases), `:67-89` (`DiscoveredItemResponse`)
- Modify: `backend/app/jobs/repository.py:238-255` (`_item_row_to_response`), new `set_item_compile_state`
- Test: `backend/tests/test_jobs.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `CompileState = Literal["pending", "compiling", "done", "skipped", "failed"]` in `app.jobs.models`
  - `DiscoveredItemResponse.compile_state: CompileState | None`, `.compile_note: str | None`
  - `repository.set_item_compile_state(job_id: str, item_id: str, state: CompileState, note: str | None = None) -> None`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_jobs.py`:

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/test_jobs.py::test_set_item_compile_state_roundtrips -v`

Expected: FAIL with `AttributeError: module 'app.jobs.repository' has no attribute 'set_item_compile_state'`

- [ ] **Step 3: Add the columns**

In `backend/app/core/database.py`, extend `_DISCOVERED_ITEM_ADDED_COLUMNS` (keep the existing entries, append these two):

```python
    # Per-item compile outcome, advanced by the runner as it works through the
    # confirmed list (pending → compiling → done | skipped | failed) so the
    # compile screen can show real progress instead of one opaque spinner.
    # `compile_note` is the user-facing reason an item was skipped or failed, and
    # outlives the compile: the finished screen reports what was left out and why.
    # Both are NULL on items that were never confirmed for this compile.
    ("compile_state", "TEXT"),
    ("compile_note", "TEXT"),
```

- [ ] **Step 4: Add the model fields**

In `backend/app/jobs/models.py`, next to the other `Literal` aliases at the top:

```python
CompileState = Literal["pending", "compiling", "done", "skipped", "failed"]
```

and at the end of `DiscoveredItemResponse` (after `reading_time_min`):

```python
    # How this item fared in the compile, filled in from the moment the user
    # confirms and advanced as the runner reaches it. None on items that weren't
    # part of the compile. `skipped` means there was nothing usable to build from
    # (no subtitles, no readable text); `failed` means something broke. Both carry
    # a short, user-facing reason in `compile_note` — the compile no longer drops
    # a chosen item without saying why.
    compile_state: CompileState | None = None
    compile_note: str | None = None
```

- [ ] **Step 5: Read and write the columns**

In `backend/app/jobs/repository.py`, add the two fields at the end of `_item_row_to_response`:

```python
        compile_state=row["compile_state"],
        compile_note=row["compile_note"],
```

and add this function (put it directly after `get_selected_items`):

```python
def set_item_compile_state(
    job_id: str, item_id: str, state: CompileState, note: str | None = None
) -> None:
    """Advance one item's compile outcome: one row, one UPDATE.

    Called by the runner at each transition, so the compile screen's existing
    poll sees per-item progress land as it happens. `note` is the user-facing
    reason for a `skipped` or `failed` item; passing none clears it, so a reason
    can never outlive the state it explained.
    """
    with get_connection() as conn:
        conn.execute(
            "UPDATE job_discovered_items SET compile_state = ?, compile_note = ? "
            "WHERE job_id = ? AND id = ?",
            (state, note, job_id, item_id),
        )
        conn.commit()
```

Add `CompileState` to the existing `from app.jobs.models import (...)` block at the top of the file.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/test_jobs.py::test_set_item_compile_state_roundtrips -v`

Expected: PASS

- [ ] **Step 7: Run the whole backend suite**

Run: `cd backend && uv run pytest -q`

Expected: all pass. A pre-existing DB in `C:\data` picks the columns up on the next `init_db()`; the new fields default to `None`, so every existing response shape still validates.

- [ ] **Step 8: Commit**

```bash
git add backend/app/core/database.py backend/app/jobs/models.py backend/app/jobs/repository.py backend/tests/test_jobs.py
git commit -m "feat(jobs): store a per-item compile outcome"
```

---

### Task 2: Expose the confirmed items while compiling

The hard blocker: `get_job` only fills `discovered_items` when the status is `reviewing`, so during `processing` the frontend receives an empty list and has nothing to render. It now returns the confirmed items, in compile order, for `processing` and `completed` too — and only the confirmed ones, because a Wikipedia page can stage 70 items for a handful of picks and this ships on every 2s poll.

**Files:**
- Modify: `backend/app/jobs/repository.py:38-48` (`get_job`), `:182-203` (`confirm_items`)
- Test: `backend/tests/test_jobs.py`

**Interfaces:**
- Consumes: `set_item_compile_state`, `DiscoveredItemResponse.compile_state` / `.compile_note` (Task 1).
- Produces: `GET /jobs/{id}` returns `discovered_items` during `processing` and `completed`, filtered to `selected = 1` and ordered by `selected_order`, each starting at `compile_state == "pending"`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_jobs.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_jobs.py -k "confirmed_items or clears_the_previous" -v`

Expected: both FAIL — the first with `assert [] == ['item-2', 'item-0']`, the second with `assert ['done'] == ['pending']`.

- [ ] **Step 3: Return the confirmed items after review**

In `backend/app/jobs/repository.py`, replace the tail of `get_job`:

```python
    response = _row_to_response(row)
    if response.status == "reviewing":
        response.discovered_items = _get_discovered_items(job_id)
    elif response.status in ("processing", "completed"):
        # Past review only the confirmed items matter, in the order they compile:
        # the compile screen tracks their per-item progress, and the finished
        # screen reports which ones didn't make it. Deliberately NOT the full
        # staged list — one Wikipedia page can stage 70 items for five picks, and
        # this response goes out on every 2s poll.
        response.discovered_items = get_selected_items(job_id)
    return response
```

- [ ] **Step 4: Reset the outcome on confirm**

In `confirm_items`, extend the two statements (everything else in the function is unchanged):

```python
        conn.execute(
            "UPDATE job_discovered_items "
            "SET selected = 0, selected_order = NULL, "
            "    compile_state = NULL, compile_note = NULL "
            "WHERE job_id = ?",
            (job_id,),
        )
        if selected_ids:
            conn.executemany(
                "UPDATE job_discovered_items "
                "SET selected = 1, selected_order = ?, compile_state = 'pending' "
                "WHERE job_id = ? AND id = ?",
                [
                    (position, job_id, item_id)
                    for position, item_id in enumerate(selected_ids)
                ],
            )
```

Confirming is the one place that defines a compile's scope, so it is also the one place that clears the last one: the wipe covers every item, then the newly selected batch starts at `pending`. Add that as a comment above the first statement, next to the existing `selected_ids` ordering note.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_jobs.py -k "confirmed_items or clears_the_previous" -v`

Expected: PASS

- [ ] **Step 6: Run the whole backend suite**

Run: `cd backend && uv run pytest -q`

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/jobs/repository.py backend/tests/test_jobs.py
git commit -m "feat(jobs): expose the confirmed items while a compile runs"
```

---

### Task 3: Give every dropped item a reason

The three chapter builders currently `return None` in five places, with the reason only in the log. They now raise `ItemSkipped(reason)` — matching how `YouTubeUnavailable`, `ScrapeUnavailable` and `CompilationError` already carry hand-written user-facing text in this file. Their return type becomes non-optional, so an item can no longer disappear without a reason attached.

**Files:**
- Modify: `backend/app/jobs/runner.py:36` (module scope), `:110-140` (`_youtube_chapter`), `:142-170` (`_podcast_chapter`), `:174-205` (`_blog_chapter`)
- Test: `backend/tests/test_runner.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `runner.ItemSkipped(Exception)`
  - `runner.NO_SUBTITLES`, `NO_TRANSCRIPTION`, `NO_CONTENT`, `YOUTUBE_RATE_LIMITED`, `ITEM_FAILED` — `str` constants
  - `_youtube_chapter`, `_podcast_chapter`, `_blog_chapter` all return `CompiledChapter` (never `None`) and raise `ItemSkipped` instead.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_runner.py`, and add `import pytest` at the top of the file:

```python
@patch("app.jobs.runner.load_transcript")
def test_youtube_chapter_skips_with_a_reason_when_there_are_no_subtitles(mock_load):
    """The reason a video didn't make it has to leave the log: it's what the
    compile screen shows next to the item."""
    mock_load.return_value = None
    with pytest.raises(runner.ItemSkipped) as excinfo:
        runner._youtube_chapter(_youtube_item(), "job1", [], "")
    assert str(excinfo.value) == "No subtitles available."


@patch("app.jobs.runner.load_episode_transcript")
def test_podcast_chapter_skips_with_a_reason_when_transcription_is_unavailable(mock_load):
    mock_load.return_value = None
    with pytest.raises(runner.ItemSkipped) as excinfo:
        runner._podcast_chapter(_podcast_item(), "job1", [], "")
    assert str(excinfo.value) == "Transcription unavailable."


@patch("app.jobs.runner.scrape_article")
def test_blog_chapter_skips_with_a_reason_when_the_page_has_no_text(mock_scrape):
    mock_scrape.return_value = Article(
        url="https://blog.example.com/posts/hello", title="An article",
        content_html="", author=None, published_at=None,
    )
    with pytest.raises(runner.ItemSkipped) as excinfo:
        runner._blog_chapter(_blog_item(), "job1", [], "")
    assert str(excinfo.value) == "No readable content."
```

Check `Article`'s real field names in `backend/app/sources/models.py` before running, and match the constructor the existing blog tests in this file already use.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_runner.py -k "skips_with_a_reason" -v`

Expected: FAIL with `AttributeError: module 'app.jobs.runner' has no attribute 'ItemSkipped'`

- [ ] **Step 3: Add the exception and the reasons**

In `backend/app/jobs/runner.py`, just below `logger = logging.getLogger(__name__)`:

```python
class ItemSkipped(Exception):
    """One item has nothing usable to build a chapter from.

    Carries the user-facing reason, exactly like YouTubeUnavailable and
    ScrapeUnavailable next door. Raised by the chapter builders and caught per
    item by the loop, which records the reason against the item and carries on:
    an item the user picked never disappears without an explanation, and never
    costs them the rest of the compilation.
    """


# The reasons an item didn't make it into the book. They travel with the item to
# the compile screen and survive to the finished one, so they're written for a
# reader rather than a log: what happened, no blame, no jargon.
NO_SUBTITLES = "No subtitles available."
NO_TRANSCRIPTION = "Transcription unavailable."
NO_CONTENT = "No readable content."
YOUTUBE_RATE_LIMITED = "YouTube rate-limited this request."
ITEM_FAILED = "This item could not be built."
```

- [ ] **Step 4: Make the builders raise**

Five edits, all in `backend/app/jobs/runner.py`. Change each signature's return type from `CompiledChapter | None` to `CompiledChapter`, and replace each `return None`:

In `_youtube_chapter`:

```python
    transcript = load_transcript(video_id)
    if transcript is None:
        raise ItemSkipped(NO_SUBTITLES)
```

```python
    if not content_md:
        raise ItemSkipped(NO_CONTENT)
```

In `_podcast_chapter`:

```python
    transcript = load_episode_transcript(item.url)
    if transcript is None:
        raise ItemSkipped(NO_TRANSCRIPTION)
```

```python
    if not content_md:
        raise ItemSkipped(NO_CONTENT)
```

In `_blog_chapter`:

```python
    if not content_md:
        raise ItemSkipped(NO_CONTENT)
```

Delete the two now-redundant `logger.info("... skipping ...")` lines that preceded the first and third of these — the loop logs the skip once, in one place, in Task 4. Keep every other comment in these functions intact; only the `job_id` parameter's use changes (it stays, for the surrounding log lines).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_runner.py -k "skips_with_a_reason" -v`

Expected: PASS

- [ ] **Step 6: Run the compile-phase tests**

Run: `cd backend && uv run pytest tests/test_runner.py -q`

Expected: some existing tests may now fail — the loop still expects `chapter is not None` and doesn't catch `ItemSkipped`. That is Task 4. If any fail, note which and move on; do not patch the loop here.

- [ ] **Step 7: Commit**

```bash
git add backend/app/jobs/runner.py backend/tests/test_runner.py
git commit -m "feat(compile): give every dropped item a written reason"
```

---

### Task 4: Isolate item failures and record progress

The loop is the one place that knows both the item and its outcome, so it does all the state writing and all the logging. A failing item is marked and stepped over instead of taking the job down; the guard rail is that zero surviving chapters still fails the job outright (`compile_book` already raises `CompilationError` for that).

**Files:**
- Modify: `backend/app/jobs/runner.py:38-107` (`run_compilation`)
- Test: `backend/tests/test_runner.py`

**Interfaces:**
- Consumes: `repository.set_item_compile_state` (Task 1); `ItemSkipped` and the reason constants (Task 3).
- Produces: `run_compilation` writes `compiling` → `done | skipped | failed` per item and completes the job whenever at least one chapter survives.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_runner.py`:

```python
def _states(mock_state):
    """The (item_id, state, note) triples the runner wrote, in order."""
    return [
        (c.args[1], c.args[2], c.args[3] if len(c.args) > 3 else None)
        for c in mock_state.call_args_list
    ]


def _second_youtube_item() -> DiscoveredItemResponse:
    return DiscoveredItemResponse(
        id="j-0-1", source_index=0, item_index=1, item_type="youtube",
        title="Another video", url="https://www.youtube.com/watch?v=def456",
    )


def _transcript(video_id: str) -> Transcript:
    return Transcript(
        video_id=video_id, language="en",
        segments=[TranscriptSegment(text="hello world", start_s=0.0, duration_s=1.0)],
    )


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.get_job")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_records_each_item_and_skips_without_stopping(
    mock_selected, mock_fetch, mock_render, mock_update, mock_job, mock_state,
    tmp_path, monkeypatch,
):
    """An item with nothing to compile is recorded with its reason and stepped
    over. The rest of the compilation is not the user's to lose."""
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_youtube_item(), _second_youtube_item()]
    mock_job.return_value = SimpleNamespace(book_title="My Book")
    mock_fetch.side_effect = [None, _transcript("def456")]

    runner.run_compilation("job1")

    assert mock_update.call_args.args[1] == "completed"
    assert _states(mock_state) == [
        ("j-0-0", "compiling", None),
        ("j-0-0", "skipped", "No subtitles available."),
        ("j-0-1", "compiling", None),
        ("j-0-1", "done", None),
    ]


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.get_job")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_survives_an_item_that_blows_up(
    mock_selected, mock_fetch, mock_render, mock_update, mock_job, mock_state,
    tmp_path, monkeypatch,
):
    """An unexpected crash on one item used to fail the whole job, losing every
    other item and offering a retry that would do exactly the same thing."""
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_youtube_item(), _second_youtube_item()]
    mock_job.return_value = SimpleNamespace(book_title="My Book")
    mock_fetch.side_effect = [RuntimeError("boom"), _transcript("def456")]

    runner.run_compilation("job1")

    assert mock_update.call_args.args[1] == "completed"
    assert _states(mock_state) == [
        ("j-0-0", "compiling", None),
        ("j-0-0", "failed", "This item could not be built."),
        ("j-0-1", "compiling", None),
        ("j-0-1", "done", None),
    ]


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.get_job")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_selected_items")
def test_run_compilation_fails_when_no_item_survives(
    mock_selected, mock_fetch, mock_render, mock_update, mock_job, mock_state,
    tmp_path, monkeypatch,
):
    """The guard rail: tolerating bad items must not produce an empty book."""
    import app.core.config as cfg
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    mock_selected.return_value = [_youtube_item(), _second_youtube_item()]
    mock_job.return_value = SimpleNamespace(book_title="My Book")
    mock_fetch.return_value = None

    runner.run_compilation("job1")

    assert mock_update.call_args.args[1] == "failed"
    mock_render.assert_not_called()
    # Both items still carry their reason, so the failure screen isn't blank.
    assert _states(mock_state) == [
        ("j-0-0", "compiling", None),
        ("j-0-0", "skipped", "No subtitles available."),
        ("j-0-1", "compiling", None),
        ("j-0-1", "skipped", "No subtitles available."),
    ]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_runner.py -k "records_each_item or blows_up or no_item_survives" -v`

Expected: FAIL — `ImportError: cannot import name 'set_item_compile_state'` once the patch target is resolved, or an unhandled `ItemSkipped` propagating out of the loop.

- [ ] **Step 3: Rewrite the loop**

In `backend/app/jobs/runner.py`, add `set_item_compile_state` to the existing `from app.jobs.repository import (...)` block, then replace the `for item in items:` loop:

```python
        for item in items:
            set_item_compile_state(job_id, item.id, "compiling")
            try:
                if item.item_type == "youtube":
                    chapter = _youtube_chapter(item, job_id, roles, model)
                elif item.item_type == "podcast":
                    chapter = _podcast_chapter(item, job_id, roles, model)
                else:
                    chapter = _blog_chapter(item, job_id, roles, model)
            except ItemSkipped as exc:
                # Nothing usable to build from. Expected, explainable, and never
                # fatal: the reason is written against the item and shown next to
                # it, on this screen and on the finished one.
                logger.info("Skipped %s (job %s): %s", item.url, job_id, exc)
                set_item_compile_state(job_id, item.id, "skipped", str(exc))
                continue
            except YouTubeUnavailable as exc:
                # External and usually transient (a 429 from this IP), so it reads
                # as failed rather than skipped: retrying later is the actual fix.
                logger.error("YouTube unavailable for %s (job %s): %s", item.url, job_id, exc)
                youtube_unavailable = True
                set_item_compile_state(job_id, item.id, "failed", YOUTUBE_RATE_LIMITED)
                continue
            except Exception:
                # One broken item must not cost the user the other nine. The raw
                # cause goes to the log; the item gets one calm written line, and
                # the compile carries on with what's left.
                logger.exception("Item %s failed (job %s)", item.url, job_id)
                set_item_compile_state(job_id, item.id, "failed", ITEM_FAILED)
                continue
            chapters.append(chapter)
            set_item_compile_state(job_id, item.id, "done")
```

The `if chapter is not None:` guard is gone: the builders no longer return `None`, so a value here is always a chapter. Leave the `if not chapters and youtube_unavailable:` block below it exactly as it is — it turns a wholly rate-limited run into the specific, actionable message, and `compile_book` already raises `CompilationError` for every other empty run.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_runner.py -k "records_each_item or blows_up or no_item_survives" -v`

Expected: PASS

- [ ] **Step 5: Run the whole backend suite**

Run: `cd backend && uv run pytest -q`

Expected: all pass — but only after patching the five older `test_runner.py` tests that don't yet know about the new write. They patch `app.jobs.runner.update_job_status` but not `set_item_compile_state`, so the loop's first call reaches the real repository against a `tmp_path` DB that `init_db()` was never run on, and the missing-table error fails the job. Add `@patch("app.jobs.runner.set_item_compile_state")` as the **outermost** (topmost) decorator. `unittest.mock` pairs decorators with parameters bottom-up, so the topmost decorator's mock is the **last** mock parameter, immediately before `tmp_path`. Apply it to each of:

- `test_run_compilation_youtube_completes`
- `test_run_compilation_writes_markdown_companion`
- `test_run_compilation_podcast_completes`
- `test_run_compilation_skips_podcast_without_transcript`
- `test_run_compilation_blog_completes`
- `test_run_compilation_fails_when_no_subtitles`
- `test_run_compilation_reports_youtube_rate_limit`

(Seven, if all of them touch the loop — patch whichever of these actually call `run_compilation`.) Their assertions stay exactly as they are: this is test plumbing for a new collaborator, not a behaviour change. Do not move the `set_item_compile_state` call inside the loop's `try` to dodge this — the write happening before the build is what makes a crashing item show as `compiling` rather than vanish.

- [ ] **Step 6: Commit**

```bash
git add backend/app/jobs/runner.py backend/tests/test_runner.py
git commit -m "feat(compile): isolate item failures and record per-item progress"
```

---

### Task 5: Show the compile as it happens

Replace the bare `Compiling…` spinner with the list of items being worked through, mirroring `DiscoveringView` so the two waits read as one continuous progression. The final "Building the file" step is deduced from "every item is terminal".

**Files:**
- Modify: `frontend/lib/api.ts:28-46` (`DiscoveredItem`)
- Modify: `frontend/app/jobs/[id]/page.tsx:396-397` (the `processing` branch), new `CompilingView` + `CompileStep` next to `DiscoveringView` (`:434-489`)

**Interfaces:**
- Consumes: `compile_state` / `compile_note` on every item returned during `processing` (Tasks 1, 2, 4).
- Produces: `CompileState` exported from `@/lib/api`; `CompilingView({ items }: { items: DiscoveredItem[] })`.

- [ ] **Step 1: Add the wire types**

In `frontend/lib/api.ts`, above `DiscoveredItem`:

```ts
export type CompileState =
  | "pending"
  | "compiling"
  | "done"
  | "skipped"
  | "failed";
```

and at the end of the `DiscoveredItem` interface:

```ts
  // How this item fared in the compile, present from the moment it's confirmed;
  // null on items that weren't part of one. "skipped" is nothing usable to build
  // from, "failed" is something that broke, and both carry the user-facing reason
  // in compile_note.
  compile_state: CompileState | null;
  compile_note: string | null;
```

- [ ] **Step 2: Add the two components**

In `frontend/app/jobs/[id]/page.tsx`, directly after `DiscoveringView`:

```tsx
// The wait between "Generate" and the finished compilation. It walks the items
// the user confirmed, in the order they compile, and shows each one's outcome as
// the runner reaches it — built, or left out with the reason why — then one last
// step for assembling the file. Same shape as DiscoveringView above, so the two
// waits read as one continuous progression toward the payoff rather than two
// unrelated screens with a spinner in common.
function CompilingView({ items }: { items: DiscoveredItem[] }) {
  // The runner works the list in order and writes each transition as it goes, so
  // "every item is terminal" is exactly "the last chapter is built" — which is
  // when the only remaining work (assembling the book and rendering the file)
  // starts. Deduced rather than stored: it's true by construction, costs no extra
  // write, and a DB field would only flip a poll later, leaving a fully ticked
  // list sitting there doing nothing in between.
  const building =
    items.length > 0 &&
    items.every((it) =>
      ["done", "skipped", "failed"].includes(it.compile_state ?? "pending"),
    );
  const built = items.filter((it) => it.compile_state === "done").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 text-sm font-medium">
        <Spinner />
        {building
          ? "Building your compilation…"
          : `Working through your ${items.length} item${items.length !== 1 ? "s" : ""}…`}
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((it) => (
          <CompileStep
            key={it.id}
            state={it.compile_state ?? "pending"}
            label={it.title}
            note={it.compile_note}
          />
        ))}
        {/* The one step that isn't an item: turning the finished chapters into
            the file you take away. It happens last, so it sits last. */}
        <CompileStep
          state={building ? "compiling" : "pending"}
          label="Building the file"
        />
      </ul>
      <p className="text-muted-foreground text-xs">
        {built} of {items.length} ready. This can take a few minutes.
      </p>
    </div>
  );
}

// One row of the compile list: a state glyph, the item's name, and — when it
// didn't make it — the reason, on its own line under the name. The glyphs extend
// the discovery list's vocabulary (check, spinner, waiting dot) with the two
// outcomes only a compile has: left out, and failed. Neither is dramatised; the
// glyph and the reason state what happened and nothing more.
function CompileStep({
  state,
  label,
  note,
}: {
  state: CompileState;
  label: string;
  note?: string | null;
}) {
  const done = state === "done";
  const active = state === "compiling";
  const out = state === "skipped" || state === "failed";
  return (
    <li className="bg-muted/40 flex items-start gap-2.5 rounded-lg px-3 py-2 text-xs">
      <span className="flex size-3.5 shrink-0 items-center justify-center pt-0.5">
        {done ? (
          <Check className="text-foreground/60 size-3.5" />
        ) : active ? (
          <Spinner className="size-3.5" />
        ) : state === "failed" ? (
          <X className="text-destructive size-3.5" />
        ) : state === "skipped" ? (
          <Minus className="text-muted-foreground size-3.5" />
        ) : (
          <span className="bg-muted-foreground/30 size-1.5 rounded-full" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate",
            done ? "text-foreground" : "text-muted-foreground",
            state === "pending" && "opacity-50",
          )}
        >
          {label}
        </span>
        {out && note && (
          <span className="text-muted-foreground/80">{note}</span>
        )}
      </span>
      {active && <span className="text-muted-foreground shrink-0">building…</span>}
    </li>
  );
}
```

- [ ] **Step 3: Render it**

Replace the `processing` branch:

```tsx
          ) : job.status === "processing" ? (
            <CompilingView items={job.discovered_items} />
```

Add `type CompileState` to the existing `from "@/lib/api"` import block. `Check`, `Minus` and `X` are already imported from `lucide-react`; `StatusMessage` stays, it still serves the pre-job `Loading…` state.

- [ ] **Step 4: Lint and build**

Run: `cd frontend && pnpm lint` then `pnpm build`

Expected: both clean. A type error on `compile_state` means Step 1 was missed.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api.ts "frontend/app/jobs/[id]/page.tsx"
git commit -m "feat(ui): show the compile item by item instead of one spinner"
```

---

### Task 6: Say what didn't make it

The compile no longer dies on a bad item, so a finished compilation can be missing pieces the user picked. Handing back fewer chapters than were asked for without saying so is the exact failure this whole change exists to end, so the finished screen carries it.

**Files:**
- Modify: `frontend/app/jobs/[id]/page.tsx:497-551` (`CompletedView` counts), `:642-649` (after the meta line), new `LeftOutNotice`

**Interfaces:**
- Consumes: `compile_state` / `compile_note` on the items returned for a `completed` job (Task 2).
- Produces: `LeftOutNotice({ items }: { items: DiscoveredItem[] })`, rendering `null` when everything made it.

- [ ] **Step 1: Add the component**

In `frontend/app/jobs/[id]/page.tsx`, directly after `CompletedView`:

```tsx
// What the user picked and didn't get. It sits above the downloads, not below:
// this is context for what they're about to take away, not a footnote after
// they've taken it. Absent entirely when everything made it, so it never turns
// a clean run into a screen with a warning on it.
function LeftOutNotice({ items }: { items: DiscoveredItem[] }) {
  const leftOut = items.filter(
    (it) => it.compile_state === "skipped" || it.compile_state === "failed",
  );
  if (leftOut.length === 0) return null;
  return (
    <Notice variant="warning">
      <span className="font-medium">
        {leftOut.length} item{leftOut.length !== 1 ? "s" : ""} didn’t make it in
      </span>
      {/* Bounded rather than truncated: a long list scrolls, so a compilation
          that lost twenty items says so twenty times instead of hiding the tail
          behind a count. */}
      <ul className="mt-1.5 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
        {leftOut.map((it) => (
          <li key={it.id} className="flex min-w-0 flex-col">
            <span className="truncate">{it.title}</span>
            {it.compile_note && (
              <span className="opacity-75">{it.compile_note}</span>
            )}
          </li>
        ))}
      </ul>
    </Notice>
  );
}
```

- [ ] **Step 2: Render it, and count only what was built**

In `CompletedView`, replace the `selectedItems` / `counted` / `sourceCount` block:

```tsx
  // Sources actually represented in the compilation. Preference goes to the items
  // that became chapters: a source whose every item was left out isn't in the
  // book, and counting it would overstate what the user is holding. Falls back to
  // the selection (jobs from before per-item outcomes carry none) and then to the
  // staged source list.
  const selectedItems = job.discovered_items.filter((it) => it.selected);
  const builtItems = selectedItems.filter((it) => it.compile_state === "done");
  const counted = builtItems.length
    ? builtItems
    : selectedItems.length
      ? selectedItems
      : job.discovered_items;
  const sourceCount =
    new Set(counted.map((it) => it.source_index)).size || job.sources.length;
```

and insert the notice immediately after the `{sourceCount} source…` paragraph, inside the same header `div`, riding the existing arrival cascade:

```tsx
        <div className={cn(rise, riseIn)} style={at(880)}>
          <LeftOutNotice items={job.discovered_items} />
        </div>
```

- [ ] **Step 3: Lint and build**

Run: `cd frontend && pnpm lint` then `pnpm build`

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/jobs/[id]/page.tsx"
git commit -m "feat(ui): report what the compilation left out"
```

---

### Task 7: Verify it in the running app

Unit tests cover the transitions; only a real run proves the poll, the deduced final step, and the notice behave together.

**Files:** none (verification only).

- [ ] **Step 1: Run everything**

```bash
cd backend && uv run pytest -q
cd ../frontend && pnpm lint && pnpm build
```

Expected: green on all three. Do not proceed on a failure — fix it in the task that owns the file.

- [ ] **Step 2: Start both servers**

Backend: `cd backend && uv run uvicorn app.main:app --reload --port 8000`
Frontend: `cd frontend && pnpm dev`

`BACKEND_URL` must be `http://127.0.0.1:8000`, not `localhost`. Record both in `.claude/dev-url` (`front http://localhost:3000`, `back http://localhost:8000`). If a port is taken by another project, pick another and move on.

- [ ] **Step 3: Compile a mixed selection**

Search for a YouTube channel, select 3 or 4 videos including at least one you expect to have no subtitles, add a blog URL, and generate. Watch the compile screen and confirm:
  - every selected item is listed, in the order confirmed at review;
  - exactly one row shows the spinner at a time, and rows tick over as it advances;
  - a skipped item shows its reason under its title;
  - "Building the file" lights up only once every item row is terminal, and there is no gap where the list is fully ticked and nothing is active;
  - the finished screen shows the left-out notice with the same reasons, and the source count reflects only what was built.

- [ ] **Step 4: Confirm nothing regressed on the clean path**

Compile a single article that works. The compile screen should show one item and the final step; the finished screen should show no notice at all.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(compile): <what the real run turned up>"
```

If the run was clean, there is nothing to commit — say so rather than inventing a commit.

---

## Self-Review

**Spec coverage** — the five locked decisions and the two resolved questions:

| Decision | Task |
|---|---|
| 1. Per-item outcome model, not a bool | Task 1 (`CompileState`, `compile_note`) |
| 2. One final "Building the file" step | Task 5 (`CompilingView`, deduced) |
| 3. Skipped info survives to the completed screen | Task 2 (items exposed when `completed`) + Task 6 (`LeftOutNotice`) |
| 4. A failing item no longer kills the job; zero survivors still fails | Task 4 (per-item `except`, `compile_book` guard rail, dedicated test) |
| 5. Approach A: two columns via `_add_missing_columns`, one-row UPDATE | Task 1 |
| Open Q1: final step deduced client-side | Task 5, with the rationale in the comment |
| Open Q2: `ItemSkipped` exception over a result object | Task 3 |
| `confirm_items` resets both columns | Task 2 |
| `get_job` returns only selected items, in `selected_order` | Task 2 |
| Reason strings as drafted | Task 3 (module constants) |

**Type consistency** — `CompileState` is defined once per side (`app.jobs.models`, `lib/api.ts`) and imported everywhere else. `set_item_compile_state(job_id, item_id, state, note=None)` is called with that exact positional shape in Task 4 and asserted with it in the tests. `compile_state` / `compile_note` keep the same names from SQLite column through Pydantic field to TypeScript property, so the JSON needs no mapping layer.

**Known gap, deliberate:** there is no frontend test runner in this repo (`frontend/package.json` has `dev`, `build`, `start`, `lint` and nothing else). Tasks 5 and 6 are therefore verified by `pnpm lint` + `pnpm build` and by the real run in Task 7, not by unit tests. Adding a test runner is out of scope here.
