import json
import uuid
from datetime import datetime, timezone

from app.core.database import get_connection
from app.jobs.models import (
    CompileState,
    DiscoveredItemResponse,
    JobCreate,
    JobResponse,
    JobStatus,
    Source,
)


def create_job(payload: JobCreate) -> JobResponse:
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    sources_json = json.dumps([s.model_dump(mode="json") for s in payload.sources])

    with get_connection() as conn:
        conn.execute(
            "INSERT INTO jobs (id, status, sources, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (job_id, "discovering", sources_json, now_iso, now_iso),
        )
        conn.commit()

    return JobResponse(
        id=job_id,
        status="discovering",
        sources=payload.sources,
        created_at=now,
        updated_at=now,
    )


def get_job(job_id: str) -> JobResponse | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()

    if row is None:
        return None

    response = _row_to_response(row)
    if response.status == "reviewing":
        response.discovered_items = _get_discovered_items(job_id)
    elif response.status in ("processing", "completed", "failed"):
        # Past review only the confirmed items matter, in the order they compile:
        # the compile screen tracks their per-item progress, and the finished
        # screen reports which ones didn't make it. Deliberately NOT the full
        # staged list — one Wikipedia page can stage 70 items for five picks, and
        # this response goes out on every 2s poll. `failed` belongs here too, and
        # arguably matters most here: it's the state where every item was written
        # off, so the per-item reasons the runner just wrote are the only account
        # of what happened. A job that failed during discovery (before anything
        # was confirmed) simply has no selected items, so this comes back empty
        # for it — no special case needed.
        response.discovered_items = get_selected_items(job_id)
    return response


def list_jobs() -> list[JobResponse]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM jobs ORDER BY created_at DESC").fetchall()
    return [_row_to_response(row) for row in rows]


def update_job_status(
    job_id: str,
    status: JobStatus,
    *,
    book_title: str | None = None,
    output_path: str | None = None,
    output_md_path: str | None = None,
    error: str | None = None,
) -> None:
    columns = ["status = ?", "updated_at = ?"]
    values: list[object] = [status, datetime.now(timezone.utc).isoformat()]

    for column, value in (
        ("book_title", book_title),
        ("output_path", output_path),
        ("output_md_path", output_md_path),
        ("error", error),
    ):
        if value is not None:
            columns.append(f"{column} = ?")
            values.append(value)

    values.append(job_id)
    with get_connection() as conn:
        conn.execute(f"UPDATE jobs SET {', '.join(columns)} WHERE id = ?", values)
        conn.commit()


def reap_orphaned_jobs() -> int:
    """Fail jobs left mid-flight by a previous process (called once at startup).

    Jobs run in-process via BackgroundTasks with no persistence, so a restart
    (crash, redeploy, OOM) while a job is `discovering` or `processing` strands
    it in that status forever — nothing remains to advance it. On boot we mark
    any such job `failed` so the UI shows a real terminal state (and offers a
    fresh start) instead of an eternal spinner. Returns the number reaped.
    """
    message = (
        "The server restarted while this compilation was still running, so it "
        "stopped. Start a new one."
    )
    item_message = "The server restarted before this item was built."
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        # Settle any item the runner left mid-flight (compiling) or never reached
        # (pending) BEFORE touching the job row. get_job now renders this item
        # list on a failed job (so the reasons don't vanish behind the terminal
        # screen), and an item stuck at `compiling` would show a spinner that
        # never resolves there. This UPDATE has to run first because it selects
        # on the job's status: once the job below is flipped to `failed`, the
        # `WHERE job_id IN (...)` subselect below would find nothing to settle.
        conn.execute(
            "UPDATE job_discovered_items SET compile_state = 'failed', "
            "compile_note = ? "
            "WHERE compile_state IN ('compiling', 'pending') "
            "AND job_id IN (SELECT id FROM jobs WHERE status IN "
            "('discovering', 'processing'))",
            (item_message,),
        )
        cursor = conn.execute(
            "UPDATE jobs SET status = 'failed', error = ?, updated_at = ? "
            "WHERE status IN ('discovering', 'processing')",
            (message, now_iso),
        )
        conn.commit()
        return cursor.rowcount


def set_job_sources(job_id: str, sources: list[Source]) -> None:
    """Rewrite the stored sources JSON.

    Called after discovery to persist each source's discovered name, so the
    review screen can label every source group by its real name (channel /
    playlist / blog title) instead of the raw URL.
    """
    sources_json = json.dumps([s.model_dump(mode="json") for s in sources])
    with get_connection() as conn:
        conn.execute(
            "UPDATE jobs SET sources = ? WHERE id = ?",
            (sources_json, job_id),
        )
        conn.commit()


def save_discovered_items(job_id: str, items: list[DiscoveredItemResponse]) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        conn.execute("DELETE FROM job_discovered_items WHERE job_id = ?", (job_id,))
        conn.executemany(
            """INSERT INTO job_discovered_items
               (id, job_id, source_index, item_index, item_type, title, url,
                estimated_duration_s, estimated_size_chars, preview_html,
                selected, created_at, has_transcript, transcript_lang,
                is_punctuated, word_count, reading_time_min)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                (
                    item.id,
                    job_id,
                    item.source_index,
                    item.item_index,
                    item.item_type,
                    item.title,
                    item.url,
                    item.estimated_duration_s,
                    item.estimated_size_chars,
                    item.preview_html,
                    int(item.selected),
                    now_iso,
                    _bool_to_int(item.has_transcript),
                    item.transcript_lang,
                    _bool_to_int(item.is_punctuated),
                    item.word_count,
                    item.reading_time_min,
                )
                for item in items
            ],
        )
        conn.commit()


def set_job_llm_roles(job_id: str, roles: list[str]) -> None:
    """Persist the LLM roles chosen for this compile (read back by the runner)."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE jobs SET llm_roles = ? WHERE id = ?",
            (json.dumps(roles), job_id),
        )
        conn.commit()


def get_job_llm_roles(job_id: str) -> list[str]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT llm_roles FROM jobs WHERE id = ?", (job_id,)
        ).fetchone()
    if row is None or not row["llm_roles"]:
        return []
    return json.loads(row["llm_roles"])


def confirm_items(job_id: str, selected_ids: list[str]) -> list[DiscoveredItemResponse]:
    # `selected_ids` arrives in the order the user wants compiled (the review
    # screen lets sources be dragged into a new order). Persist that position so
    # the compile reads items back in it, not in discovery order. Confirming is
    # the one place that defines a compile's scope, so it is also the one place
    # that clears the last one: the wipe covers every item, then the newly
    # selected batch starts at `pending`.
    with get_connection() as conn:
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
        conn.commit()

    return get_selected_items(job_id)


def get_selected_items(job_id: str) -> list[DiscoveredItemResponse]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM job_discovered_items "
            "WHERE job_id = ? AND selected = 1 "
            # selected_order carries the user's drag order; source/item index is a
            # stable tiebreak (and the fallback for jobs confirmed before it existed).
            "ORDER BY selected_order, source_index, item_index",
            (job_id,),
        ).fetchall()
    return [_item_row_to_response(row) for row in rows]


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


def get_discovered_item(job_id: str, item_id: str) -> DiscoveredItemResponse | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM job_discovered_items WHERE job_id = ? AND id = ?",
            (job_id, item_id),
        ).fetchone()
    return _item_row_to_response(row) if row is not None else None


def _get_discovered_items(job_id: str) -> list[DiscoveredItemResponse]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM job_discovered_items "
            "WHERE job_id = ? ORDER BY source_index, item_index",
            (job_id,),
        ).fetchall()
    return [_item_row_to_response(row) for row in rows]


def _item_row_to_response(row) -> DiscoveredItemResponse:
    return DiscoveredItemResponse(
        id=row["id"],
        source_index=row["source_index"],
        item_index=row["item_index"],
        item_type=row["item_type"],
        title=row["title"],
        url=row["url"],
        estimated_duration_s=row["estimated_duration_s"],
        estimated_size_chars=row["estimated_size_chars"],
        preview_html=row["preview_html"],
        selected=bool(row["selected"]),
        has_transcript=_int_to_bool(row["has_transcript"]),
        transcript_lang=row["transcript_lang"],
        is_punctuated=_int_to_bool(row["is_punctuated"]),
        word_count=row["word_count"],
        reading_time_min=row["reading_time_min"],
        compile_state=row["compile_state"],
        compile_note=row["compile_note"],
    )


def _bool_to_int(value: bool | None) -> int | None:
    return None if value is None else int(value)


def _int_to_bool(value: int | None) -> bool | None:
    return None if value is None else bool(value)


def _row_to_response(row) -> JobResponse:
    sources = [Source(**s) for s in json.loads(row["sources"])]
    return JobResponse(
        id=row["id"],
        status=row["status"],
        sources=sources,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        book_title=row["book_title"],
        output_path=row["output_path"],
        output_md_path=row["output_md_path"],
        error=row["error"],
    )
