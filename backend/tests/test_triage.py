from unittest.mock import patch

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
