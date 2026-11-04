from unittest.mock import patch

from app.core.gateway import GatewayError, GatewayResponse
from app.sources import exa_podcast
from app.sources.exa_podcast import find_transcript, parse_episode_page, titles_match

# Trimmed from a real Exa episode page (2026-11-04), names made generic.
PAGE = """# #110 : Du tricot aux DIY TikTok : les loisirs créatifs ont-ils changé ?

- **Podcast:** [Craft & Blabla](https://exa.ai/library/podcast/8r4wp009mnk)
- **Published:** 2026-10-20T23:00:00+00:00
- **Duration:** 64:37.329
- **Language:** fr

## Transcript

**Alice · 00:00.031–00:31.072**

Bonjour à toutes et à tous, bienvenue dans le podcast.

Deux fois par mois, nous partageons nos inspirations.

**Hortense · 00:31.432–00:37.697**

Très bien, il fait très beau.

**Unidentified Speaker 0 · 1:02:05.000–1:02:09.500**

Merci !

## Show notes

**Les recommandations de l'épisode :**

- [A link](https://a.example)
"""


def test_parse_keeps_turns_speakers_and_times_and_stops_at_next_section():
    language, duration_s, segments = parse_episode_page(PAGE)
    assert language == "fr"
    assert round(duration_s, 3) == 3877.329
    assert [(s.speaker, s.text) for s in segments] == [
        ("Alice", "Bonjour à toutes et à tous, bienvenue dans le podcast. "
                  "Deux fois par mois, nous partageons nos inspirations."),
        ("Hortense", "Très bien, il fait très beau."),
        ("Unidentified Speaker 0", "Merci !"),
    ]
    assert segments[1].start_s == 31.432 and round(segments[1].duration_s, 3) == 6.265
    assert segments[2].start_s == 3725.0  # H:MM:SS


def test_page_without_transcript_yields_nothing():
    assert parse_episode_page("# Title\n\n- **Language:** en\n")[2] == []


def test_titles_match_ignores_episode_numbers_case_and_punctuation():
    assert titles_match("Roman Civil War: Rise of the General (Part 1)",
                        "701. Roman Civil War: Rise of the General (Part 1)")
    assert titles_match("#110 : Du tricot aux DIY TikTok", "Ep. 110 - du tricot aux DIY TikTok !")


def test_titles_match_rejects_a_neighbouring_episode():
    assert not titles_match("The Most Important AI News This Week Is Getting Overlooked",
                            "The Biggest AI News This Week Is Getting Overlooked")
    assert not titles_match("Roman Civil War: Rise of the General (Part 1)",
                            "Roman Civil War: Marching on the Senate (Part 3)")


def _hit(title, text, url="https://exa.ai/library/podcast/s/episode/e"):
    return {"title": title, "url": url, "text": text}


def _ok(results):
    return GatewayResponse(status=200, data={"results": results}, via="treg")


def test_find_picks_the_matching_result_not_the_first():
    other = _hit("Some other show", PAGE.replace("Alice", "Bob"))
    good = _hit("Du tricot aux DIY TikTok : les loisirs créatifs ont-ils changé ?", PAGE)
    with patch.object(exa_podcast.gateway, "call", return_value=_ok([other, good])):
        t = find_transcript("audio.mp3",
                            "#110 : Du tricot aux DIY TikTok : les loisirs créatifs ont-ils changé ?",
                            3877)
    assert t.video_id == "audio.mp3" and t.language == "fr"
    assert t.segments[0].speaker == "Alice"


def test_find_rejects_a_same_title_episode_of_very_different_length():
    hit = _hit("Du tricot aux DIY TikTok : les loisirs créatifs ont-ils changé ?", PAGE)
    with patch.object(exa_podcast.gateway, "call", return_value=_ok([hit])):
        assert find_transcript("a.mp3", hit["title"], 20 * 60) is None


def test_find_returns_none_when_the_gateway_fails():
    with patch.object(exa_podcast.gateway, "call", side_effect=GatewayError("down")):
        assert find_transcript("a.mp3", "Any title here", None) is None


def test_titles_differing_only_by_a_number_never_match():
    assert not titles_match("The Fall of Rome, Part 1", "The Fall of Rome, Part 2")


def test_short_generic_titles_are_never_trusted():
    assert not titles_match("Ep 41: Mailbag", "#212 - Mailbag")
    assert not titles_match("Episode 1", "Episode 1")


def test_without_a_known_length_only_an_exact_title_is_trusted():
    near = _hit("Roman Civil War: Rise of the General, Part 1 (Ad-Free)", PAGE)
    with patch.object(exa_podcast.gateway, "call", return_value=_ok([near])):
        assert find_transcript("a.mp3", "Roman Civil War: Rise of the General (Part 1)", None) is None
    exact = _hit("701. Roman Civil War: Rise of the General (Part 1)", PAGE)
    with patch.object(exa_podcast.gateway, "call", return_value=_ok([exact])):
        assert find_transcript("a.mp3", "Roman Civil War: Rise of the General (Part 1)", None) is not None


def test_odd_header_values_do_not_raise():
    page = PAGE.replace("64:37.329", "1h 04m").replace("00:31.432", "1..2")
    language, duration_s, segments = parse_episode_page(page)
    assert duration_s is None and segments  # the bad turn is skipped, the rest kept


def test_header_fields_are_read_from_the_header_only():
    page = PAGE.replace("Très bien, il fait très beau.", "- **Duration:** 1:00.000")
    assert round(parse_episode_page(page)[1], 3) == 3877.329


def test_find_never_raises():
    with patch.object(exa_podcast.gateway, "call", side_effect=KeyError("runId")):
        assert find_transcript("a.mp3", "Roman Civil War: Rise of the General (Part 1)", 4752) is None
