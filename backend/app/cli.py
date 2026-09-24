"""Command-line front door: the same discover → pick → compile flow as the web
app, run in-process against a throwaway database instead of the HTTP API.

The command's name lives in one place, `[project.scripts]` in pyproject.toml;
help text reads it back from argv so a rename touches nothing here.
"""

import argparse
import json
import logging
import re
import shutil
import sys
import tempfile
from pathlib import Path

from app.core.config import settings
from app.core.database import init_db
from app.jobs import repository
from app.jobs.models import DiscoveredItemResponse, JobCreate, Source
from app.jobs.phases import run_discovery
from app.jobs.runner import run_compilation
from app.pipeline.llm import llm_available
from app.pipeline.roles import ROLES

KIND_LABELS = {"youtube": "video", "podcast": "episode", "blog": "article"}


def parse_selection(spec: str, count: int) -> list[int]:
    """'1-3,7' → [0, 1, 2, 6] (0-based, in the order given, no duplicates)."""
    picked: list[int] = []
    for part in spec.replace(" ", "").split(","):
        if not part:
            continue
        start, dash, end = part.partition("-")
        try:
            first = int(start)
            last = int(end) if dash else first
        except ValueError:
            raise ValueError(f"'{part}' is not a number or a range like 2-5.") from None
        if not 1 <= first <= last <= count:
            raise ValueError(f"'{part}' is outside 1-{count}.")
        picked.extend(i - 1 for i in range(first, last + 1) if i - 1 not in picked)
    if not picked:
        raise ValueError("Nothing selected.")
    return picked


def _fail(message: str) -> int:
    print(f"error: {message}", file=sys.stderr)
    return 1


def _discover(urls: list[str]) -> tuple[str, list[DiscoveredItemResponse], list[str]]:
    """Run discovery; returns (job id, items, source names) or raises with the
    job's own user-facing error."""
    try:
        payload = JobCreate(sources=[Source(url=u) for u in urls])
    except ValueError as exc:
        raise RuntimeError(f"Invalid URL. {exc.errors()[0]['msg']}.") from None
    job = repository.create_job(payload)
    print(f"Reading {len(urls)} source(s)…", file=sys.stderr)
    run_discovery(job.id, payload.sources)
    job = repository.get_job(job.id)
    if job.status != "reviewing":
        raise RuntimeError(job.error or "Those sources couldn't be read.")
    names = [s.name or str(s.url) for s in job.sources]
    return job.id, job.discovered_items, names


def _item_json(number: int, item: DiscoveredItemResponse, names: list[str]) -> dict:
    return {
        "number": number,
        "type": KIND_LABELS[item.item_type],
        "title": item.title,
        "url": item.url,
        "source": names[item.source_index],
        "duration_s": item.estimated_duration_s,
        "reading_time_min": item.reading_time_min,
        "has_transcript": item.has_transcript,
    }


def _print_items(items: list[DiscoveredItemResponse], names: list[str]) -> None:
    width = len(str(len(items)))
    current = None
    for number, item in enumerate(items, 1):
        if item.source_index != current:
            current = item.source_index
            print(f"\n{names[current]}")
        extra = f"  ({item.reading_time_min} min)" if item.reading_time_min else ""
        print(f"  {number:>{width}}  {KIND_LABELS[item.item_type]:<7}  {item.title}{extra}")


def cmd_list(args: argparse.Namespace) -> int:
    try:
        _, items, names = _discover(args.urls)
    except RuntimeError as exc:
        return _fail(str(exc))
    if args.json:
        print(json.dumps([_item_json(n, i, names) for n, i in enumerate(items, 1)], indent=2))
    else:
        _print_items(items, names)
    return 0


def cmd_compile(args: argparse.Namespace) -> int:
    if args.ai and not llm_available():
        return _fail("--ai needs a model. Set LLM_BASE_URL and LLM_MODEL (and LLM_API_KEY).")
    try:
        job_id, items, names = _discover(args.urls)
    except RuntimeError as exc:
        return _fail(str(exc))

    try:
        if args.select:
            picked = parse_selection(args.select, len(items))
        elif args.all or not sys.stdin.isatty() or len(items) == 1:
            picked = list(range(len(items)))
        else:
            _print_items(items, names)
            answer = input(f"\nItems to compile (e.g. 1-3,7; Enter for all {len(items)}): ")
            picked = parse_selection(answer, len(items)) if answer.strip() else list(range(len(items)))
    except ValueError as exc:
        return _fail(str(exc))
    except (EOFError, KeyboardInterrupt):
        return 130

    repository.confirm_items(job_id, [items[i].id for i in picked])
    roles = [r.id for r in ROLES if r.tier == "default"] if args.ai else []
    repository.set_job_llm_roles(job_id, roles)
    repository.update_job_status(job_id, "processing", book_title=args.title)
    print(f"Compiling {len(picked)} item(s)…", file=sys.stderr)
    run_compilation(job_id)

    job = repository.get_job(job_id)
    for item in job.discovered_items:
        if item.compile_state in ("skipped", "failed"):
            print(f"  {item.compile_state}: {item.title}. {item.compile_note}", file=sys.stderr)
    if job.status != "completed":
        return _fail(job.error or "The compilation failed to build.")

    source = job.output_md_path if args.format == "md" else job.output_path
    default_name = re.sub(r'[\\/:*?"<>|]+', "-", job.book_title or "compilation")
    output = Path(args.output or f"{default_name}.{args.format}")
    shutil.copyfile(source, output)
    print(output)
    return 0


def build_parser(prog: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=prog, description="Turn videos, podcasts and articles into one readable compilation."
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="show progress logs")
    commands = parser.add_subparsers(dest="command", required=True)

    listing = commands.add_parser("list", help="show what the sources contain")
    listing.add_argument("urls", nargs="+", metavar="URL")
    listing.add_argument("--json", action="store_true", help="machine-readable output")
    listing.set_defaults(run=cmd_list)

    compiling = commands.add_parser("compile", help="build a compilation from the sources")
    compiling.add_argument("urls", nargs="+", metavar="URL")
    compiling.add_argument("-o", "--output", help="output file (default: the book title)")
    compiling.add_argument("-f", "--format", choices=["epub", "md"], default="epub")
    compiling.add_argument("-t", "--title", help="book title (default: from the sources)")
    picking = compiling.add_mutually_exclusive_group()
    picking.add_argument("-s", "--select", metavar="SPEC", help="items to keep, numbered as in `list`, e.g. 1-3,7")
    picking.add_argument("-a", "--all", action="store_true", help="keep every item without asking")
    compiling.add_argument("--ai", action="store_true", help="AI polish: punctuation and copyedit (needs a model)")
    compiling.set_defaults(run=cmd_compile)
    return parser


def main() -> int:
    args = build_parser(Path(sys.argv[0]).stem).parse_args()
    logging.basicConfig(level=logging.INFO if args.verbose else logging.CRITICAL)
    # ponytail: a fresh temp dir per run, so transcript and AI caches don't survive
    # between runs; point DATA_DIR at a folder to keep them.
    if settings.data_dir == Path("/data"):
        settings.data_dir = Path(tempfile.mkdtemp())
    init_db()
    return args.run(args)


if __name__ == "__main__":
    sys.exit(main())
