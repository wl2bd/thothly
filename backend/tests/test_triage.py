import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.search.models import SearchResult
from app.search.triage import _Verdict, rank, triage


def _r(i: int, published: str | None = None) -> SearchResult:
    meta = {"published_at": published} if published else {}
    return SearchResult(id=f"x:{i}", type="video", title=f"t{i}", url=f"https://x/{i}", source="youtube", meta=meta)


def _j(i, relevance=2, compilable=True, level="intermediate", format="lecture"):
    return {"i": i, "compilable": compilable, "relevance": relevance, "format": format, "level": level}


def _v(results, freshness="any", level="any"):
    return _Verdict.model_validate({"freshness": freshness, "level": level, "results": results})


def test_drops_uncompilable_and_off_topic_then_sorts_by_relevance():
    results = [_r(0), _r(1), _r(2), _r(3)]
    verdict = _v([_j(0, relevance=1), _j(1, compilable=False, relevance=3), _j(2, relevance=0), _j(3, relevance=3)])
    assert [r.id for r in rank(results, verdict)] == ["x:3", "x:0"]


def test_level_gap_breaks_relevance_ties():
    results = [_r(0), _r(1)]
    verdict = _v([_j(0, level="expert"), _j(1, level="intro")], level="intro")
    assert [r.id for r in rank(results, verdict)] == ["x:1", "x:0"]


def test_recent_request_puts_newest_first_and_undated_last():
    results = [_r(0, "2020-01-01T00:00:00Z"), _r(1), _r(2, "2026-09-01T10:00:00-07:00")]
    verdict = _v([_j(0), _j(1), _j(2)], freshness="recent")
    assert [r.id for r in rank(results, verdict)] == ["x:2", "x:0", "x:1"]


def test_date_ignored_when_freshness_is_any():
    results = [_r(0, "2020-01-01"), _r(1, "2026-09-01")]
    assert [r.id for r in rank(results, _v([_j(0), _j(1)]))] == ["x:0", "x:1"]


def test_unjudged_results_are_kept_after_judged_and_bad_indices_ignored():
    results = [_r(0), _r(1)]
    assert [r.id for r in rank(results, _v([_j(1), _j(7)]))] == ["x:1", "x:0"]


def test_failure_returns_results_untouched():
    results = [_r(0), _r(1)]
    with patch("app.search.triage._ask", side_effect=RuntimeError("boom")):
        assert triage("q", results) == results


def test_fractional_relevance_drops_below_half_and_sorts_finely():
    """TypeSafe scores a spectrum, not a rung: 0.4 is off-topic, 0.6 is not, and
    two results a tenth apart still sort in the right order."""
    results = [_r(0), _r(1), _r(2)]
    verdict = _v([_j(0, relevance=2.3), _j(1, relevance=0.4), _j(2, relevance=2.4)])
    assert [r.id for r in rank(results, verdict)] == ["x:2", "x:0"]


def test_typesafe_reads_one_batched_answer_per_result():
    """The whole point of the batched call: one response carries every result's
    judgments under indexed keys, and a probability over a half is a yes."""
    from app.search import triage as t

    answers = SimpleNamespace(
        nouls={"compilable_0": SimpleNamespace(noul=0.93), "compilable_1": SimpleNamespace(noul=0.07)},
        scores={"relevance_0": SimpleNamespace(score=2.85), "relevance_1": SimpleNamespace(score=0.02)},
        choices={
            "freshness": SimpleNamespace(choice="any"),
            "wanted_level": SimpleNamespace(choice="expert"),
            "format_0": SimpleNamespace(choice="lecture"),
            "level_0": SimpleNamespace(choice="expert"),
            "format_1": SimpleNamespace(choice="other"),
            "level_1": SimpleNamespace(choice="intro"),
        },
    )
    client = MagicMock()
    client.__enter__.return_value.system_one.return_value = answers
    with patch.dict(sys.modules, {"typesafe_sdk": MagicMock(TypeSafeClient=MagicMock(return_value=client))}):
        verdict = t._ask_typesafe("q", [_r(0), _r(1)])

    assert verdict.level == "expert"
    assert [(j.i, j.compilable, j.relevance) for j in verdict.results] == [(0, True, 2.85), (1, False, 0.02)]


def test_typesafe_skips_a_result_the_model_left_unanswered():
    """A missing key must not shift the others onto the wrong result: the gap is
    skipped and `rank` keeps that result in its original place."""
    from app.search import triage as t

    answers = SimpleNamespace(
        nouls={"compilable_1": SimpleNamespace(noul=0.9)},
        scores={"relevance_1": SimpleNamespace(score=3.0)},
        choices={
            "freshness": SimpleNamespace(choice="any"),
            "wanted_level": SimpleNamespace(choice="any"),
            "format_1": SimpleNamespace(choice="article"),
            "level_1": SimpleNamespace(choice="intro"),
        },
    )
    client = MagicMock()
    client.__enter__.return_value.system_one.return_value = answers
    with patch.dict(sys.modules, {"typesafe_sdk": MagicMock(TypeSafeClient=MagicMock(return_value=client))}):
        verdict = t._ask_typesafe("q", [_r(0), _r(1)])

    assert [j.i for j in verdict.results] == [1]
    assert [r.id for r in rank([_r(0), _r(1)], verdict)] == ["x:1", "x:0"]
