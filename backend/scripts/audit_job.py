"""Score a finished compilation against its sources, so you don't have to read it.

    uv run python scripts/audit_job.py <job-id> [--full]

Each chapter is compared with the zero-LLM rendering of the same source — what
would have shipped with AI polish off — and flagged only when something is
measurably off. Chapters with no flag need no attention. No model is called.

`--full` prints every chapter, including the clean ones.
"""

import sys

from app.jobs.repository import get_job, get_selected_items
# The runner's own id extractor, so the audit reads the same cache entry the
# compile wrote rather than a second, subtly different parse.
from app.jobs.runner import _extract_video_id
from app.pipeline.audit import audit_chapter, split_chapters
from app.pipeline.compiler import transcript_to_markdown
from app.pipeline.titles import normalize_title
from app.sources.transcript_cache import load_transcript


def _source_markdown(item) -> str | None:
    """The chapter as it would read with AI polish off — mirroring exactly what
    `_youtube_chapter` does on the free path. Only YouTube items can be
    reconstructed for free: a podcast's source is a paid transcription and a
    blog's is a live re-scrape, so neither is re-fetched here."""
    if item.item_type != "youtube":
        return None
    transcript = load_transcript(_extract_video_id(item.url))
    if transcript is None:
        return None
    return transcript_to_markdown(transcript)


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    job_id, full = argv[0], "--full" in argv

    job = get_job(job_id)
    if job is None:
        print(f"No job {job_id}")
        return 1
    if not job.output_md_path:
        print(f"Job {job_id} has no Markdown output (status: {job.status})")
        return 1

    with open(job.output_md_path, encoding="utf-8") as fh:
        chapters = split_chapters(fh.read())

    audits, unmeasured = [], []
    for item in get_selected_items(job_id):
        # The book stores the normalized title, so match on that rather than the
        # raw discovery title (ALL-CAPS videos are rewritten on the way in).
        body = chapters.get(normalize_title(item.title).strip())
        source = _source_markdown(item)
        if body is None or source is None:
            unmeasured.append(item.title)
            continue
        audits.append(audit_chapter(item.title, source, body))

    print(f"\n{job.book_title}  ({len(audits)} chapter(s) measured)\n")
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
        print("  Podcasts and articles have no free source to compare against.\n")

    print(
        f"{len(flagged)} of {len(audits)} chapter(s) worth a look."
        if flagged
        else "Nothing flagged. The compilation is faithful on every mechanical check."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
