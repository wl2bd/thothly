from unittest.mock import patch

import pytest

import app.sources.podcast as podcast
from app.jobs.models import DiscoveredItemResponse
from app.sources.models import DiscoveredItem, SourceSpec
from app.pipeline.transcribe import STTResult, STTSegment
from app.sources.discovery import detect_kind, discover_source
from app.sources.podcast import load_episode_transcript

AUDIO_URL = "https://cdn.example/show/ep1.mp3"


def _episode(**fields) -> DiscoveredItem:
    return DiscoveredItem(
        **{"title": "Ep 1", "url": AUDIO_URL, "item_type": "podcast",
           "source_index": 0, "item_index": 0, **fields}
    )


@pytest.fixture
def db(monkeypatch):
    """An STT endpoint configured (Voxtral via Mistral, say)."""
    monkeypatch.setattr(podcast.settings, "stt_base_url", "https://api.mistral.ai/v1")
    monkeypatch.setattr(podcast.settings, "stt_model", "voxtral-mini-latest")


@pytest.fixture(autouse=True)
def no_live_exa(monkeypatch):
    """Discovery now looks up published transcripts; never hit Exa from tests."""
    monkeypatch.setattr(podcast.exa_podcast, "available", lambda: False)


# ── discovery ─────────────────────────────────────────────────────────────────

def test_detect_kind_audio_url_is_podcast():
    assert detect_kind(AUDIO_URL) == "podcast"
    assert detect_kind("https://example.com/article") == "blog"


def test_discover_podcast_uses_title_hint():
    name, items = discover_source(SourceSpec(url=AUDIO_URL, kind="podcast", title="Ep 1: Origins"), 0)

    assert name == "Ep 1: Origins"
    assert len(items) == 1
    assert items[0].item_type == "podcast"
    assert items[0].url == AUDIO_URL
    assert items[0].title == "Ep 1: Origins"


def test_discover_podcast_falls_back_to_url_slug():
    _, items = discover_source(SourceSpec(url=AUDIO_URL, kind="podcast"), 0)
    assert items[0].title == "Ep1"  # derived from the .mp3 slug


def test_discover_podcast_carries_duration_for_cost_estimate():
    # The episode length (from the search result) must reach the discovered item,
    # or the review screen's transcription cost estimate reads as $0.
    _, items = discover_source(SourceSpec(url=AUDIO_URL, kind="podcast", duration_s=1470), 0)
    assert items[0].estimated_duration_s == 1470


def test_discover_picked_episode_carries_its_published_transcript(db):
    from app.jobs.preview import build_item_preview
    from app.sources.models import Transcript, TranscriptSegment

    found = Transcript(video_id=AUDIO_URL, language="en", segments=[
        TranscriptSegment(text="Hello there, and welcome to the show.", start_s=0, duration_s=3, speaker="Ann"),
    ])
    with patch.object(podcast.exa_podcast, "available", return_value=True),          patch.object(podcast.exa_podcast, "find_transcript", return_value=found) as find:
        _, items = discover_source(SourceSpec(url=AUDIO_URL, kind="podcast", title="Ep 1: Origins", duration_s=60), 0)
        # the compile reuses the cached hit instead of paying again
        assert load_episode_transcript(items[0]).segments[0].speaker == "Ann"
    find.assert_called_once()
    item = items[0]
    assert (item.has_transcript, item.word_count) == (True, 7)
    preview = build_item_preview(DiscoveredItemResponse(id="x", **item.model_dump()))
    assert preview.available and "welcome to the show" in preview.content_md


def test_discover_episode_without_published_transcript_stays_from_audio(db):
    with patch.object(podcast.exa_podcast, "available", return_value=True),          patch.object(podcast.exa_podcast, "find_transcript", return_value=None),          patch.object(podcast, "_transcribe_episode") as stt:
        _, items = discover_source(SourceSpec(url=AUDIO_URL, kind="podcast", title="Ep 1: Origins"), 0)
    assert items[0].has_transcript is None
    stt.assert_not_called()


# ── transcript assembly + cache ───────────────────────────────────────────────

def test_transcribe_episode_assembles_transcript(db):
    # ffmpeg is absent in CI, so _split yields the whole file as one chunk.
    def fake_download(url, workdir):
        path = workdir / "episode.mp3"
        path.write_bytes(b"audio")
        return path

    with patch.object(podcast, "_download", side_effect=fake_download), patch.object(
        podcast,
        "transcribe_file",
        return_value=STTResult(text="Hello world. This is the show.", segments=[]),
    ) as mock_tx:
        transcript = load_episode_transcript(_episode())

    assert transcript is not None
    assert transcript.video_id == AUDIO_URL
    assert transcript.full_text == "Hello world. This is the show."
    assert mock_tx.call_count == 1


def test_transcribe_episode_keeps_segments_and_speakers(db):
    """A diarized single-request result becomes timed, speaker-labelled segments."""
    def fake_download(url, workdir):
        path = workdir / "episode.mp3"
        path.write_bytes(b"audio")
        return path

    result = STTResult(
        text="Hi. Hello back.",
        segments=[
            STTSegment(text="Hi.", start=0.0, end=1.0, speaker="speaker_1"),
            STTSegment(text="Hello back.", start=1.2, end=2.5, speaker="speaker_2"),
        ],
    )
    with patch.object(podcast, "_download", side_effect=fake_download), patch.object(
        podcast, "transcribe_file", return_value=result
    ):
        transcript = load_episode_transcript(_episode())

    assert [s.speaker for s in transcript.segments] == ["speaker_1", "speaker_2"]
    assert transcript.segments[1].start_s == 1.2  # single chunk → no offset


def test_transcribe_episode_is_cached(db):
    def fake_download(url, workdir):
        path = workdir / "episode.mp3"
        path.write_bytes(b"audio")
        return path

    with patch.object(podcast, "_download", side_effect=fake_download), patch.object(
        podcast,
        "transcribe_file",
        return_value=STTResult(text="cached text", segments=[]),
    ) as mock_tx:
        first = load_episode_transcript(_episode())
        second = load_episode_transcript(_episode())  # served from the DB cache

    assert first.full_text == second.full_text == "cached text"
    assert mock_tx.call_count == 1  # transcribed once, never re-paid


def test_transcribe_episode_skips_when_unconfigured(monkeypatch):
    monkeypatch.setattr(podcast.settings, "stt_base_url", None)  # no STT endpoint

    assert load_episode_transcript(_episode()) is None


def test_transcribe_episode_skips_on_download_failure(db):
    with patch.object(podcast, "_download", return_value=None):
        assert load_episode_transcript(_episode()) is None


def test_split_without_ffmpeg_returns_whole_file(tmp_path):
    audio = tmp_path / "episode.mp3"
    audio.write_bytes(b"audio")
    with patch.object(podcast.shutil, "which", return_value=None):
        assert podcast._split(audio, 25) == [audio]


# ── download: size cap ────────────────────────────────────────────────────────

def test_download_enforces_size_cap(tmp_path, monkeypatch, web):
    import httpx

    monkeypatch.setattr(podcast.settings, "stt_max_download_mb", 1)  # 1 MB cap
    web(lambda req: httpx.Response(200, content=b"x" * (2 * 1024 * 1024)))

    assert podcast._download("https://cdn.example/show/ep.mp3", tmp_path) is None


def test_published_transcript_is_used_before_transcribing(db):
    from app.sources.models import Transcript, TranscriptSegment

    found = Transcript(video_id=AUDIO_URL, language="en",
                       segments=[TranscriptSegment(text="Hi.", start_s=0, duration_s=1, speaker="Ann")])
    with patch.object(podcast.exa_podcast, "available", return_value=True), \
         patch.object(podcast.exa_podcast, "find_transcript", return_value=found) as find, \
         patch.object(podcast, "_transcribe_episode") as stt:
        assert load_episode_transcript(_episode(title="Ep 1", estimated_duration_s=60)) is found
        # cached: a second load pays for neither
        assert load_episode_transcript(_episode(title="Ep 1", estimated_duration_s=60)).segments[0].speaker == "Ann"
    find.assert_called_once_with(AUDIO_URL, "Ep 1", 60)
    stt.assert_not_called()


def test_no_published_transcript_falls_back_to_transcribing(db):
    with patch.object(podcast.exa_podcast, "available", return_value=True), \
         patch.object(podcast.exa_podcast, "find_transcript", return_value=None), \
         patch.object(podcast, "_transcribe_episode", return_value=None) as stt:
        assert load_episode_transcript(_episode(title="Ep 1")) is None
    stt.assert_called_once()


def test_discovery_reads_the_feeds_own_transcript_before_exa(db, monkeypatch):
    from app.sources.models import Transcript, TranscriptSegment

    seen = {}

    def fake_rss(feed_url, audio_url, title):
        seen["args"] = (feed_url, audio_url, title)
        return Transcript(
            video_id=audio_url,
            language="fr",
            segments=[TranscriptSegment(text="Bonjour et bienvenue.", start_s=0, duration_s=2)],
        )

    monkeypatch.setattr(podcast.rss_transcript, "find_transcript", fake_rss)
    _, items = discover_source(SourceSpec(url=AUDIO_URL, kind="podcast", title="Ep 1", feed_url="https://feed.example/rss"), 0)
    assert seen["args"] == ("https://feed.example/rss", AUDIO_URL, "Ep 1")
    assert items[0].has_transcript
    # Cached: the compile reuses it without another lookup.
    assert podcast.cached_episode_transcript(AUDIO_URL).language == "fr"
