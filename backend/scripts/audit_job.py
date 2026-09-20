"""Score a finished compilation against its sources, so you don't have to read it.

    uv run python scripts/audit_job.py <job-id> [--full]

Each chapter is compared with the zero-LLM rendering of the same source — what
would have shipped with AI polish off — and flagged only when something is
measurably off. Chapters with no flag need no attention. No model is called.

`--full` prints every chapter, including the clean ones.
"""

import sys

from app.core.database import init_db
from app.jobs.repository import get_job, get_job_llm_model, get_selected_items
# The runner's own id extractor, so the audit reads the same cache entry the
# compile wrote rather than a second, subtly different parse.
from app.jobs.runner import _extract_video_id
from app.pipeline.audit import audit_chapter, split_chapters
from app.pipeline.compiler import (
    demote_headings,
    html_to_markdown,
    strip_leading_title,
    transcript_to_markdown,
)
from app.pipeline.titles import normalize_title
from app.sources.blog import ScrapeUnavailable, scrape_article
from app.sources.podcast import load_episode_transcript
from app.sources.transcript_cache import load_transcript


def _source_markdown(item) -> str | None:
    """The chapter as it would read with AI polish off, mirroring each of the
    runner's free paths.

    Nothing metered runs here: a video's captions and an episode's transcription
    are both cached from the compile (the transcription was paid for once), and
    `load_episode_transcript` is called with no STT endpoint so a cache miss
    returns None rather than quietly buying a second transcription. An article
    is re-scraped, which costs only a request.
    """
    if item.item_type == "youtube":
        transcript = load_transcript(_extract_video_id(item.url))
        return transcript_to_markdown(transcript) if transcript else None

    if item.item_type == "podcast":
        transcript = load_episode_transcript(item.url, stt=None)
        return transcript_to_markdown(transcript) if transcript else None

    try:
        content_html = scrape_article(item.url).content_html
    except ScrapeUnavailable:
        return None
    md = html_to_markdown(content_html)
    return demote_headings(strip_leading_title(md, item.title)) or None


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    job_id, full = argv[0], "--full" in argv

    # Same idempotent migration the app runs at startup, so the audit works on a
    # database the current backend hasn't opened yet.
    init_db()

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

    # The model is the subject of the test, not a footnote: these numbers only
    # mean something attached to what produced them.
    model = get_job_llm_model(job_id)
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
        print("  Podcasts and articles have no free source to compare against.\n")

    print(
        f"{len(flagged)} of {len(audits)} chapter(s) worth a look."
        if flagged
        else "Nothing flagged. The compilation is faithful on every mechanical check."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
