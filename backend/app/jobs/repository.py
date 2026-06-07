import json
import uuid
from datetime import datetime, timezone

from app.core.database import get_connection
from app.jobs.models import (
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
    error: str | None = None,
) -> None:
    columns = ["status = ?", "updated_at = ?"]
    values: list[object] = [status, datetime.now(timezone.utc).isoformat()]

    for column, value in (
        ("book_title", book_title),
        ("output_path", output_path),
        ("error", error),
    ):
        if value is not None:
            columns.append(f"{column} = ?")
            values.append(value)

    values.append(job_id)
    with get_connection() as conn:
        conn.execute(f"UPDATE jobs SET {', '.join(columns)} WHERE id = ?", values)
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
                is_punctuated, word_count, reading_time_min, transcript_segments)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
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
                    json.dumps(item.transcript_segments)
                    if item.transcript_segments is not None
                    else None,
                )
                for item in items
            ],
        )
        conn.commit()


def confirm_items(job_id: str, selected_ids: list[str]) -> list[DiscoveredItemResponse]:
    with get_connection() as conn:
        conn.execute(
            "UPDATE job_discovered_items SET selected = 0 WHERE job_id = ?", (job_id,)
        )
        if selected_ids:
            placeholders = ",".join("?" for _ in selected_ids)
            conn.execute(
                "UPDATE job_discovered_items SET selected = 1 "
                f"WHERE job_id = ? AND id IN ({placeholders})",
                [job_id, *selected_ids],
            )
        conn.commit()

    return get_selected_items(job_id)


def get_selected_items(job_id: str) -> list[DiscoveredItemResponse]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM job_discovered_items "
            "WHERE job_id = ? AND selected = 1 ORDER BY source_index, item_index",
            (job_id,),
        ).fetchall()
    return [_item_row_to_response(row) for row in rows]


def _get_discovered_items(job_id: str) -> list[DiscoveredItemResponse]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM job_discovered_items "
            "WHERE job_id = ? ORDER BY source_index, item_index",
            (job_id,),
        ).fetchall()
    return [_item_row_to_response(row) for row in rows]


def _item_row_to_response(row) -> DiscoveredItemResponse:
    segments_json = row["transcript_segments"]
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
        transcript_segments=json.loads(segments_json) if segments_json else None,
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
        error=row["error"],
    )
