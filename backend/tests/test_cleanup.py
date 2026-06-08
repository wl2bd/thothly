import pytest

import app.core.config as cfg
import app.core.database as db
from app.pipeline import cleanup
from app.pipeline.llm import LLMError
from app.pipeline.roles import COPYEDIT, PUNCTUATE, SECTIONS
from app.sources.models import Transcript, TranscriptSegment


@pytest.fixture
def db_env(tmp_path, monkeypatch):
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)
    monkeypatch.setattr(cfg.settings, "llm_model", "test-model")
    db.init_db()


def _seg(text: str, start: float) -> TranscriptSegment:
    return TranscriptSegment(text=text, start_s=start, duration_s=1.0)


def _raw_transcript(video_id: str = "vid1") -> Transcript:
    # One long unpunctuated segment (>20 words, no sentence marks).
    words = " ".join(f"mot{i}" for i in range(40))
    return Transcript(video_id=video_id, language="fr", segments=[_seg(words, 0.0)])


def _cache_rows() -> int:
    with db.get_connection() as conn:
        return conn.execute("SELECT COUNT(*) c FROM transcript_llm_cache").fetchone()["c"]


def test_punctuate_uses_faithful_llm_output(db_env, monkeypatch):
    calls: list[str] = []

    def fake(system, user, **kw):
        calls.append(user)
        return user.upper()

    monkeypatch.setattr(cleanup, "complete", fake)
    out = cleanup.clean_transcript(_raw_transcript(), [PUNCTUATE], "test-model")
    assert "MOT0" in out  # the LLM output was accepted
    assert len(calls) == 1


def test_punctuate_skips_already_punctuated(db_env, monkeypatch):
    calls: list[int] = []
    monkeypatch.setattr(cleanup, "complete", lambda *a, **k: (calls.append(1), "X")[1])
    clean = "La foi est une vertu. Elle libère l'homme. Son œil s'émerveille. " * 5
    t = Transcript(video_id="vid2", language="fr", segments=[_seg(clean, 0.0)])
    out = cleanup.clean_transcript(t, [PUNCTUATE], "test-model")
    assert calls == []  # punctuated → free sentence-split, no LLM
    assert out.strip()


def test_fidelity_guard_rejects_drift_and_keeps_source(db_env, monkeypatch):
    # The model "summarises" instead of re-punctuating — content drifts away.
    monkeypatch.setattr(
        cleanup, "complete", lambda s, u, **k: "résumé totalement différent"
    )
    out = cleanup.clean_transcript(_raw_transcript(), [PUNCTUATE], "test-model")
    assert "mot0" in out  # fell back to the source text
    assert "résumé" not in out  # the drifting output was rejected


def test_cache_avoids_second_llm_call(db_env, monkeypatch):
    calls: list[int] = []

    def fake(system, user, **kw):
        calls.append(1)
        return user.upper()

    monkeypatch.setattr(cleanup, "complete", fake)
    t = _raw_transcript()
    first = cleanup.clean_transcript(t, [PUNCTUATE], "test-model")
    second = cleanup.clean_transcript(t, [PUNCTUATE], "test-model")
    assert first == second
    assert len(calls) == 1  # second call served from cache


def test_transient_error_falls_back_and_is_not_cached(db_env, monkeypatch):
    def boom(*a, **k):
        raise LLMError("provider down")

    monkeypatch.setattr(cleanup, "complete", boom)
    out = cleanup.clean_transcript(_raw_transcript(), [PUNCTUATE], "test-model")
    assert "mot0" in out  # fell back to the source text
    assert _cache_rows() == 0  # transient failures are never cached (retry can win)


def test_clean_markdown_copyedit_accepts_trimmed_output(db_env, monkeypatch):
    src = "euh donc je pense que le sujet est vraiment important pour nous tous"
    edited = "Je pense que le sujet est important pour nous."
    monkeypatch.setattr(cleanup, "complete", lambda s, u, **k: edited)
    out = cleanup.clean_markdown(src, [COPYEDIT], "test-model", content_key="http://x")
    assert out == edited


def test_sections_preserves_body(db_env, monkeypatch):
    src = "premier paragraphe ici\n\ndeuxieme paragraphe la\n\ntroisieme bloc final"
    monkeypatch.setattr(cleanup, "complete", lambda s, u, **k: "## Intro\n" + u)
    out = cleanup.clean_markdown(src, [SECTIONS], "test-model", content_key="http://y")
    assert "## Intro" in out  # heading added
    assert "premier paragraphe" in out  # body preserved


def test_no_roles_returns_free_path_without_llm(db_env, monkeypatch):
    monkeypatch.setattr(
        cleanup, "complete", lambda *a, **k: pytest.fail("LLM must not be called")
    )
    out = cleanup.clean_transcript(_raw_transcript(), [], "test-model")
    assert out.strip()
