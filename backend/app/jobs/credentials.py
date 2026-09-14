"""A visitor's keys for one job, held in memory between confirm and compile.

Never written to the database, a file or a log. `confirm` puts them; the runner
takes them as its first act, so they leave this dict before any work can fail,
and live on only as a local of that one compilation. A server restart loses
them, exactly as it already loses the running job.
"""

from dataclasses import dataclass

from app.pipeline.providers import Endpoint


@dataclass(frozen=True)
class JobCredentials:
    llm: Endpoint | None
    stt: Endpoint | None


_held: dict[str, JobCredentials] = {}


def put(job_id: str, creds: JobCredentials) -> None:
    _held[job_id] = creds


def take(job_id: str) -> JobCredentials | None:
    return _held.pop(job_id, None)
