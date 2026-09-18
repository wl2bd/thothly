from unittest.mock import patch

from app.sources.scrapecreators import _pick_language, fetch_transcript

# Trimmed from real responses (video 822YgahP3H0, 2026-09-18).
DETAIL = {
    "durationMs": 8748000,
    "channel": {"title": "La Perspective", "url": "https://www.youtube.com/@La_Perspective"},
    "chapters": [
        {"title": "Introduction", "startSeconds": 0},
        {"title": "Gratitude et Réflexions", "startSeconds": 93},
    ],
    "captionTracks": [{"languageCode": "fr", "kind": "asr"}],
}
TRANSCRIPT = {
    "transcript": [
        {"text": "imaginez tomber sur le journal intime", "startMs": "4160", "endMs": "8559"},
        {"text": "  ", "startMs": "6000", "endMs": "6100"},
        {"text": "d'un grand empereur romain", "startMs": "6040", "endMs": "10599"},
    ]
}


@patch("app.sources.scrapecreators._call", side_effect=[DETAIL, TRANSCRIPT])
def test_fetch_transcript_maps_response(mock_call):
    t = fetch_transcript("822YgahP3H0", ["en"])

    assert t.language == "fr"
    assert [s.text for s in t.segments] == ["imaginez tomber sur le journal intime", "d'un grand empereur romain"]
    assert t.segments[0].start_s == 4.16 and round(t.segments[0].duration_s, 3) == 4.399
    assert [(c.title, c.start_s, c.end_s) for c in t.chapters] == [
        ("Introduction", 0, 93),
        ("Gratitude et Réflexions", 93, 8748),
    ]
    assert t.uploader == "La Perspective"
    assert t.channel_url == "https://www.youtube.com/@La_Perspective"
    assert mock_call.call_args.kwargs["language"] == "fr"


@patch("app.sources.scrapecreators._call", return_value={"captionTracks": []})
def test_no_caption_track_skips_the_paid_transcript_call(mock_call):
    assert fetch_transcript("x", ["en"]) is None
    assert mock_call.call_count == 1


def test_pick_language_prefers_human_subtitles_in_preferred_language():
    tracks = [{"languageCode": "fr", "kind": "asr"}, {"languageCode": "en-GB"}]
    assert _pick_language(tracks, ["en"]) == "en-GB"


def test_pick_language_takes_original_asr_over_foreign_human_track():
    tracks = [{"languageCode": "de"}, {"languageCode": "fr", "kind": "asr"}]
    assert _pick_language(tracks, ["en"]) == "fr"
