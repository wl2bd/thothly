"""Score a finished compilation against its sources, so you don't have to read it.

    uv run python scripts/audit_job.py <job-id> [--full] [--judge]

Each chapter is compared with the zero-LLM rendering of the same source — what
would have shipped with AI polish off — and flagged only when something is
measurably off. Chapters with no flag need no attention. No model is called.

`--full` prints every chapter, including the clean ones.

`--judge` has TypeSafe re-read the chapters the mechanical checks call clean,
passage by passage, for content the polish invented or meaning it changed.
It is the one step that calls a model (fractions of a cent per chapter).
"""

import sys

from app.core.config import settings
from app.core.database import init_db
from app.jobs.chapters import ItemSkipped, draft
from app.jobs.outputs import output_file
from app.jobs.repository import get_job, get_job_llm_model, get_selected_items
from app.pipeline.audit import audit_chapter, split_chapters
from app.pipeline.audit_judge import judge_chapter
from app.pipeline.titles import normalize_title
from app.sources.youtube import YouTubeUnavailable


def _source_markdown(item) -> str | None:
    """The chapter as it would read with AI polish off. Nothing metered runs:
    a video's captions and an episode's transcription were cached by the
    compile, and nothing is transcribed again. An article is re-scraped."""
    try:
        return draft(item, transcribe=False).chapter.content_md
    except (ItemSkipped, YouTubeUnavailable):
        return None


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    job_id, full, judge = argv[0], "--full" in argv, "--judge" in argv

    # Same idempotent migration the app runs at startup, so the audit works on a
    # database the current backend hasn't opened yet.
    init_db()

    job = get_job(job_id)
    if job is None:
        print(f"No job {job_id}")
        return 1
    markdown = output_file(job_id, "md")
    if not markdown.exists():
        print(f"Job {job_id} has no Markdown output (status: {job.status})")
        return 1
    chapters = split_chapters(markdown.read_text(encoding="utf-8"))

    audits, unmeasured = [], []
    for item in get_selected_items(job_id):
        # The book stores the normalized title, so match on that rather than the
        # raw discovery title (ALL-CAPS videos are rewritten on the way in).
        body = chapters.get(normalize_title(item.title).strip())
        source = _source_markdown(item)
        if body is None or source is None:
            unmeasured.append(item.title)
            continue
        audits.append((audit_chapter(item.title, source, body), source, body))

    # The model is the subject of the test, not a footnote: these numbers only
    # mean something attached to what produced them.
    model = get_job_llm_model(job_id)
    if judge:
        if not settings.openrouter_api_key:
            print("--judge needs LLM_API_KEY with LLM_BASE_URL on OpenRouter")
            return 1
        if model == settings.typesafe_model:
            # A judge grading its own work measures the judge, not the book.
            print(f"The book was compiled by the judge model ({model}); pick another judge.")
            return 1
        for a, source, body in audits:
            if a.clean:
                a.flags += judge_chapter(source, body)
    audits = [a for a, _, _ in audits]
    print(f"\n{job.book_title}")
    print(f"model: {model or 'none — compiled on the free path'}")
    print(f"{len(audits)} chapter(s) measured\n")
    flagged = [a for a in audits if not a.clean]
    for a in audits:
        if a.clean and not full:
            continue
        mark = "ok  " if a.clean else "LOOK"
        print(
            f"{mark} {a.title[:58]}\n"
            f"     {a.src_words} → {a.out_words} words "
            f"({a.word_ratio:.0%}), similarity {a.similarity:.0%}, "
            f"{a.paragraphs} paragraphs (rhythm {a.para_rhythm:.2f})"
        )
        for flag in a.flags:
            print(f"     · {flag}")
        print()

    if unmeasured:
        print(f"Not measured ({len(unmeasured)}): " + ", ".join(t[:40] for t in unmeasured))
        print("  The source could not be read again (not cached, or the page no longer loads).\n")

    print(
        f"{len(flagged)} of {len(audits)} chapter(s) worth a look."
        if flagged
        else "Nothing flagged. The compilation is faithful on every mechanical check"
        + (" and to the judge." if judge else ".")
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
