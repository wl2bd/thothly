"""Bring-your-own-LLM: the rules that keep a visitor's key theirs.

A visitor's key reaches the backend only in a verify call or a job's confirm,
must only ever be sent to an allowlisted provider, lives in memory for one job,
and has to be the key every AI call of that job actually uses, worker threads
included. See docs/superpowers/specs/2026-08-27-byok-llm-settings-design.md.
"""

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.jobs import credentials, repository, runner
from app.jobs.models import DiscoveredItemResponse
from app.pipeline.providers import (
    PROVIDERS,
    Endpoint,
    ProviderRejected,
    resolve_endpoint,
)
from app.sources.models import Transcript, TranscriptSegment

VALID_SOURCE = {"url": "https://youtube.com/playlist?list=PLtest123"}


# ── Allowlist ────────────────────────────────────────────────────────────────


def test_known_provider_resolves_to_its_own_base_url() -> None:
    ep = resolve_endpoint("mistral", api_key="sk-test", model="mistral-small-latest")
    assert ep.base_url == "https://api.mistral.ai/v1"
    assert ep.api_key == "sk-test"
    assert ep.model == "mistral-small-latest"


def test_known_provider_ignores_a_supplied_base_url() -> None:
    # A stranger naming a real provider can't redirect the server elsewhere.
    ep = resolve_endpoint(
        "openai", api_key="sk-test", model="gpt-4o-mini", base_url="http://169.254.169.254"
    )
    assert ep.base_url == "https://api.openai.com/v1"


@pytest.mark.parametrize("provider", ["", "evil", "OpenAI", "openai.evil.com", "custom"])
def test_unknown_provider_or_custom_url_is_refused_by_default(provider: str) -> None:
    with pytest.raises(ProviderRejected):
        resolve_endpoint(provider, api_key="k", model="m", base_url="http://127.0.0.1:11434/v1")


def test_custom_base_url_opens_only_behind_the_env_flag(monkeypatch) -> None:
    import app.core.config as cfg

    monkeypatch.setattr(cfg.settings, "byok_allow_custom_base_url", True)
    ep = resolve_endpoint("custom", api_key=None, model="llama3", base_url="http://127.0.0.1:11434/v1")
    assert ep.base_url == "http://127.0.0.1:11434/v1"


@pytest.mark.parametrize("url", ["", "file:///etc/passwd", "ftp://host/v1", "http://"])
def test_custom_base_url_must_be_http(monkeypatch, url: str) -> None:
    import app.core.config as cfg

    monkeypatch.setattr(cfg.settings, "byok_allow_custom_base_url", True)
    with pytest.raises(ProviderRejected):
        resolve_endpoint("custom", api_key=None, model="m", base_url=url)


def test_known_provider_requires_a_key_and_a_model() -> None:
    with pytest.raises(ProviderRejected):
        resolve_endpoint("openai", api_key=None, model="gpt-4o-mini")
    with pytest.raises(ProviderRejected):
        resolve_endpoint("openai", api_key="sk-test", model="  ")


def test_stt_is_refused_for_a_provider_without_transcription() -> None:
    no_stt = next(p for p in PROVIDERS if p.stt_per_minute is None)
    with pytest.raises(ProviderRejected):
        resolve_endpoint(no_stt.id, api_key="k", model="m", for_stt=True)


def test_endpoint_repr_never_shows_the_key() -> None:
    ep = Endpoint(base_url="https://api.openai.com/v1", model="m", api_key="sk-secret-4f2c")
    assert "sk-secret" not in repr(ep)


# ── Credential store ─────────────────────────────────────────────────────────


def test_credentials_are_taken_once() -> None:
    creds = credentials.JobCredentials(llm=Endpoint("https://x/v1", "m", "k"), stt=None)
    credentials.put("job-a", creds)
    assert credentials.take("job-a") == creds
    assert credentials.take("job-a") is None


@patch("app.jobs.runner.get_selected_items", side_effect=RuntimeError("db down"))
@patch("app.jobs.runner.update_job_status")
def test_credentials_are_dropped_even_when_the_job_fails(mock_update, mock_selected) -> None:
    credentials.put("job-b", credentials.JobCredentials(llm=Endpoint("https://x/v1", "m", "k"), stt=None))
    runner.run_compilation("job-b")
    assert mock_update.call_args.args[1] == "failed"
    assert credentials.take("job-b") is None


# ── Browser key over server env, all the way down ────────────────────────────


def _raw_youtube_item() -> DiscoveredItemResponse:
    return DiscoveredItemResponse(
        id="j-0-0", source_index=0, item_index=0, item_type="youtube",
        title="A video", url="https://www.youtube.com/watch?v=abc123",
    )


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.get_job")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_transcript")
@patch("app.jobs.runner.get_job_llm_roles", return_value=["punctuate"])
@patch("app.jobs.runner.get_selected_items")
def test_visitor_key_reaches_every_llm_call_over_the_server_key(
    mock_selected, mock_roles, mock_fetch, mock_render, mock_update, mock_job, mock_state,
    tmp_path, monkeypatch,
) -> None:
    import app.core.config as cfg
    import app.core.database as db
    import app.pipeline.cleanup as cleanup

    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)
    db.init_db()
    # The operator has a key too: the visitor's must still win.
    monkeypatch.setattr(cfg.settings, "llm_base_url", "https://operator.example/v1")
    monkeypatch.setattr(cfg.settings, "llm_model", "operator-model")
    monkeypatch.setattr(cfg.settings, "llm_api_key", "operator-key")
    monkeypatch.setattr(cfg.settings, "llm_chunk_words", 5)  # several chunks → worker threads

    seen: list[Endpoint | None] = []

    def fake_complete(system, user, *, max_tokens=4096, endpoint=None):
        seen.append(endpoint)
        return user

    monkeypatch.setattr(cleanup, "complete", fake_complete)
    words = " ".join(f"mot{i}" for i in range(30))  # unpunctuated → punctuate runs
    mock_selected.return_value = [_raw_youtube_item()]
    mock_job.return_value = SimpleNamespace(book_title="My Book")
    mock_fetch.return_value = Transcript(
        video_id="abc123", language="fr",
        segments=[TranscriptSegment(text=words, start_s=0.0, duration_s=1.0)],
    )
    visitor = Endpoint("https://api.mistral.ai/v1", "mistral-small-latest", "visitor-key")
    credentials.put("job-c", credentials.JobCredentials(llm=visitor, stt=None))

    runner.run_compilation("job-c")

    assert len(seen) > 1
    assert all(ep == visitor for ep in seen)


@patch("app.jobs.runner.set_item_compile_state")
@patch("app.jobs.runner.get_job")
@patch("app.jobs.runner.update_job_status")
@patch("app.jobs.runner.render_epub")
@patch("app.jobs.runner.load_episode_transcript", return_value=None)
@patch("app.jobs.runner.get_selected_items")
def test_visitor_stt_key_reaches_the_podcast_loader(
    mock_selected, mock_tx, mock_render, mock_update, mock_job, mock_state,
) -> None:
    mock_selected.return_value = [DiscoveredItemResponse(
        id="j-0-0", source_index=0, item_index=0, item_type="podcast",
        title="An episode", url="https://cdn.example/ep1.mp3",
    )]
    visitor_stt = Endpoint("https://api.mistral.ai/v1", "voxtral-mini-latest", "visitor-key")
    credentials.put("job-d", credentials.JobCredentials(llm=None, stt=visitor_stt))

    runner.run_compilation("job-d")

    assert mock_tx.call_args.kwargs["stt"] == visitor_stt


def test_podcast_chunks_are_transcribed_with_the_visitor_endpoint(tmp_path) -> None:
    from app.sources import podcast

    visitor_stt = Endpoint("https://api.mistral.ai/v1", "voxtral-mini-latest", "visitor-key")
    chunks = [tmp_path / "a.mp3", tmp_path / "b.mp3"]
    with patch.object(podcast, "transcribe_file") as mock_tf:
        podcast._transcribe_chunks(chunks, visitor_stt)
    assert [c.kwargs["endpoint"] for c in mock_tf.call_args_list] == [visitor_stt, visitor_stt]


# ── API ──────────────────────────────────────────────────────────────────────


def _reviewing_job(client: TestClient) -> str:
    with patch("app.jobs.router.run_discovery"):
        job_id = client.post("/jobs", json={"sources": [VALID_SOURCE]}).json()["id"]
    repository.save_discovered_items(job_id, [_raw_youtube_item()])
    repository.update_job_status(job_id, "reviewing")
    return job_id


@patch("app.jobs.router.run_compilation")
def test_confirm_holds_the_visitor_key_in_memory_only(mock_compilation, client: TestClient, tmp_path) -> None:
    job_id = _reviewing_job(client)
    resp = client.post(
        f"/jobs/{job_id}/confirm",
        json={
            "selected_ids": ["j-0-0"],
            "llm_roles": ["punctuate"],
            "llm": {"provider": "mistral", "api_key": "sk-visitor-4f2c", "model": "mistral-small-latest"},
        },
    )
    assert resp.status_code == 200
    assert "sk-visitor" not in resp.text
    held = credentials.take(job_id)
    assert held is not None and held.llm.api_key == "sk-visitor-4f2c"
    db_bytes = b"".join(p.read_bytes() for p in tmp_path.rglob("*") if p.is_file())
    assert b"sk-visitor" not in db_bytes


@patch("app.jobs.router.run_compilation")
def test_confirm_refuses_an_unlisted_provider_before_starting(mock_compilation, client: TestClient) -> None:
    job_id = _reviewing_job(client)
    resp = client.post(
        f"/jobs/{job_id}/confirm",
        json={
            "selected_ids": ["j-0-0"],
            "llm": {"provider": "custom", "api_key": "k", "model": "m", "base_url": "http://10.0.0.1/v1"},
        },
    )
    assert resp.status_code == 400
    mock_compilation.assert_not_called()
    assert repository.get_job(job_id).status == "reviewing"


def test_llm_config_lists_providers_with_their_rates(client: TestClient) -> None:
    data = client.get("/llm").json()
    ids = {p["id"] for p in data["providers"]}
    assert {"openai", "mistral", "openrouter", "groq", "together"} <= ids
    assert data["custom_base_url_allowed"] is False
    assert all("base_url" not in p for p in data["providers"])


def test_verify_returns_the_models_the_key_grants(client: TestClient) -> None:
    with patch("app.api.llm.list_models", return_value=["b-model", "a-model"]) as mock_list:
        resp = client.post("/llm/verify", json={"provider": "openai", "api_key": "sk-test"})
    assert resp.status_code == 200
    assert resp.json() == {"models": ["a-model", "b-model"]}
    assert mock_list.call_args.args[0].base_url == "https://api.openai.com/v1"


def test_verify_reports_a_refused_key(client: TestClient) -> None:
    from app.pipeline.llm import KeyRefused

    with patch("app.api.llm.list_models", side_effect=KeyRefused("nope")):
        resp = client.post("/llm/verify", json={"provider": "openai", "api_key": "sk-bad"})
    assert resp.status_code == 400
    assert "sk-bad" not in resp.text


def test_verify_refuses_an_unlisted_provider(client: TestClient) -> None:
    with patch("app.api.llm.list_models") as mock_list:
        resp = client.post(
            "/llm/verify",
            json={"provider": "custom", "api_key": "k", "base_url": "http://169.254.169.254"},
        )
    assert resp.status_code == 400
    mock_list.assert_not_called()
