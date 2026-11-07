import pytest

import app.core.database as db
from app.pipeline import cleanup
from app.pipeline.llm import LLMError
from app.pipeline.roles import COPYEDIT, PUNCTUATE, SECTIONS, language_name
from app.sources.models import Transcript, TranscriptSegment


def _seg(text: str, start: float) -> TranscriptSegment:
    return TranscriptSegment(text=text, start_s=start, duration_s=1.0)


def _raw_transcript(video_id: str = "vid1") -> Transcript:
    # One long unpunctuated segment (>20 words, no sentence marks).
    words = " ".join(f"mot{i}" for i in range(40))
    return Transcript(video_id=video_id, language="fr", segments=[_seg(words, 0.0)])


def _cache_rows() -> int:
    with db.get_connection() as conn:
        return conn.execute("SELECT COUNT(*) c FROM transcript_llm_cache").fetchone()["c"]


def test_punctuate_uses_faithful_llm_output(monkeypatch):
    calls: list[str] = []

    def fake(system, user, **kw):
        calls.append(user)
        return user.upper()

    monkeypatch.setattr(cleanup, "complete", fake)
    out = cleanup.clean_transcript(_raw_transcript(), [PUNCTUATE])
    assert "MOT0" in out  # the LLM output was accepted
    assert len(calls) == 1


def test_punctuate_skips_already_punctuated(monkeypatch):
    calls: list[int] = []
    monkeypatch.setattr(cleanup, "complete", lambda *a, **k: (calls.append(1), "X")[1])
    clean = "La foi est une vertu. Elle libère l'homme. Son œil s'émerveille. " * 5
    t = Transcript(video_id="vid2", language="fr", segments=[_seg(clean, 0.0)])
    out = cleanup.clean_transcript(t, [PUNCTUATE])
    assert calls == []  # punctuated → free sentence-split, no LLM
    assert out.strip()


def test_fidelity_guard_rejects_drift_and_keeps_source(monkeypatch):
    # The model "summarises" instead of re-punctuating — content drifts away.
    monkeypatch.setattr(
        cleanup, "complete", lambda s, u, **k: "résumé totalement différent"
    )
    out = cleanup.clean_transcript(_raw_transcript(), [PUNCTUATE])
    assert "mot0" in out  # fell back to the source text
    assert "résumé" not in out  # the drifting output was rejected


def test_cache_avoids_second_llm_call(monkeypatch):
    calls: list[int] = []

    def fake(system, user, **kw):
        calls.append(1)
        return user.upper()

    monkeypatch.setattr(cleanup, "complete", fake)
    t = _raw_transcript()
    first = cleanup.clean_transcript(t, [PUNCTUATE])
    second = cleanup.clean_transcript(t, [PUNCTUATE])
    assert first == second
    assert len(calls) == 1  # second call served from cache


def test_transient_error_falls_back_and_is_not_cached(monkeypatch):
    def boom(*a, **k):
        raise LLMError("provider down")

    monkeypatch.setattr(cleanup, "complete", boom)
    out = cleanup.clean_transcript(_raw_transcript(), [PUNCTUATE])
    assert "mot0" in out  # fell back to the source text
    assert _cache_rows() == 0  # transient failures are never cached (retry can win)


def test_clean_markdown_copyedit_accepts_trimmed_output(monkeypatch):
    src = "euh donc je pense que le sujet est vraiment important pour nous tous"
    edited = "Je pense que le sujet est important pour nous."
    monkeypatch.setattr(cleanup, "complete", lambda s, u, **k: edited)
    out = cleanup.clean_markdown(src, [COPYEDIT], content_key="http://x")
    assert out == edited


def test_sections_preserves_body(monkeypatch):
    src = "premier paragraphe ici\n\ndeuxieme paragraphe la\n\ntroisieme bloc final"
    monkeypatch.setattr(cleanup, "complete", lambda s, u, **k: "## Intro\n" + u)
    out = cleanup.clean_markdown(src, [SECTIONS], content_key="http://y")
    assert "## Intro" in out  # heading added
    assert "premier paragraphe" in out  # body preserved


def test_no_roles_returns_free_path_without_llm(monkeypatch):
    monkeypatch.setattr(
        cleanup, "complete", lambda *a, **k: pytest.fail("LLM must not be called")
    )
    out = cleanup.clean_transcript(_raw_transcript(), [])
    assert out.strip()


def test_sections_pins_transcript_language(monkeypatch):
    systems: list[str] = []

    def fake(system, user, **kw):
        systems.append(system)
        return "## Section\n\n" + user  # valid sections output (body preserved)

    monkeypatch.setattr(cleanup, "complete", fake)
    # _raw_transcript is language="fr" with no chapters → sections synthesises titles.
    cleanup.clean_transcript(_raw_transcript(), [SECTIONS])
    assert systems, "sections role should have called the LLM"
    assert "French" in systems[0]  # language named outright…
    assert "in the language of the text" not in systems[0]  # …not the generic clause


def test_sections_articles_keep_generic_prompt(monkeypatch):
    systems: list[str] = []

    def fake(system, user, **kw):
        systems.append(system)
        return "## Intro\n\n" + user

    monkeypatch.setattr(cleanup, "complete", fake)
    # Articles carry no reliable language tag → keep the infer-from-text prompt.
    cleanup.clean_markdown(
        "premier paragraphe ici\n\ndeuxieme paragraphe la",
        [SECTIONS],

        content_key="http://z",
    )
    assert systems
    assert "in the language of the text" in systems[0]


def test_language_name_maps_tags_and_falls_back():
    assert language_name("fr") == "French"
    assert language_name("fr-FR") == "French"  # region suffix stripped
    assert language_name("EN") == "English"  # case-insensitive
    assert language_name(None) is None
    assert language_name("xx") is None  # unknown → generic clause kept


def test_stop_ends_polishing_before_the_next_llm_call(monkeypatch):
    calls = []
    monkeypatch.setattr(cleanup, "complete", lambda s, u, **k: (calls.append(1), u)[1])
    with pytest.raises(cleanup.CompileStopped):
        cleanup.clean_transcript(
            _raw_transcript(), [PUNCTUATE, COPYEDIT], should_stop=lambda: True
        )
    assert calls == []
    assert _cache_rows() == 0  # a half-polished text is never cached


def test_stop_also_ends_article_polishing(monkeypatch):
    calls = []
    monkeypatch.setattr(cleanup, "complete", lambda s, u, **k: (calls.append(1), u)[1])
    with pytest.raises(cleanup.CompileStopped):
        cleanup.clean_markdown(
            "Some text here.", [COPYEDIT], content_key="k", should_stop=lambda: True
        )
    assert calls == []


def test_chaptered_video_is_polished_chapter_by_chapter(monkeypatch):
    monkeypatch.setattr(cleanup, "complete", lambda s, u, **k: u)
    from app.sources.models import Chapter

    words = " ".join(f"mot{i}" for i in range(40))
    transcript = Transcript(
        video_id="chap1",
        language="fr",
        segments=[_seg(words, 0.0), _seg(words, 60.0)],
        chapters=[Chapter(title="Début", start_s=0.0, end_s=50.0), Chapter(title="Fin <b>", start_s=50.0, end_s=99.0)],
    )
    md = cleanup.clean_transcript(transcript, [PUNCTUATE])
    assert "## Début" in md and "## Fin \<b>" in md


def test_preface_is_written_in_the_book_language(monkeypatch):
    seen = {}
    monkeypatch.setattr(cleanup, "complete", lambda s, u, **k: (seen.update(system=s), "Une préface.")[1])
    assert cleanup.generate_preface("Livre", ["Un", "Deux"], language="fr") == "Une préface."
    assert language_name("fr") in seen["system"]
