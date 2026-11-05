from unittest.mock import patch

from app.sources import rss_transcript as rss

FEED = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
  <title>Show</title>
  <language>fr-FR</language>
  <item>
    <title>#12 - Le design engineer</title>
    <enclosure url="https://dts.podtrac.com/redirect.mp3/cdn.host/ep12.mp3?utm=x" type="audio/mpeg"/>
    <podcast:transcript url="https://cdn.host/ep12.txt" type="text/plain"/>
    <podcast:transcript url="https://cdn.host/ep12.vtt" type="text/vtt" language="en"/>
    <podcast:transcript url="https://cdn.host/ep12.srt" type="application/srt"/>
  </item>
  <item>
    <title>#11 - Sans transcript</title>
    <enclosure url="https://cdn.host/ep11.mp3" type="audio/mpeg"/>
  </item>
  <item>
    <title>Bonus : les outils</title>
    <enclosure url="https://other.host/bonus.mp3" type="audio/mpeg"/>
    <podcast:transcript url="https://cdn.host/bonus.json" type="application/json"/>
  </item>
</channel>
</rss>"""


def test_finds_item_by_enclosure_file_despite_tracking_prefix():
    tags, lang = rss.transcript_tags(FEED, "https://cdn.host/ep12.mp3", title=None)
    assert [t.url for t in tags][0] == "https://cdn.host/ep12.vtt"  # vtt preferred
    assert lang == "fr"


def test_falls_back_to_exact_title():
    tags, _ = rss.transcript_tags(FEED, "https://elsewhere/x.mp3", title="Bonus : les outils")
    assert [t.type for t in tags] == ["application/json"]


def test_no_match_or_no_transcript_gives_nothing():
    assert rss.transcript_tags(FEED, "https://cdn.host/ep11.mp3", None)[0] == []
    assert rss.transcript_tags(FEED, "https://nope/z.mp3", "Autre chose")[0] == []
    assert rss.transcript_tags("<not xml", "https://cdn.host/ep12.mp3", None)[0] == []


def test_parse_srt():
    srt = "1\n00:00:01,000 --> 00:00:03,500\nHello there.\n\n2\n00:01:02,000 --> 00:01:04,000\nSecond <i>line</i>\ncontinued.\n"
    segs = rss.parse_transcript(srt, "application/srt")
    assert [(s.text, s.start_s) for s in segs] == [("Hello there.", 1.0), ("Second line continued.", 62.0)]
    assert segs[0].duration_s == 2.5


def test_parse_vtt_with_voice_tags():
    vtt = "WEBVTT\n\nNOTE skip me\n\n00:05.000 --> 00:07.000\n<v Alice>Bonjour à tous.</v>\n\n00:00:08.000 --> 00:00:09.000 align:start\n<v Bob>Salut.\n"
    segs = rss.parse_transcript(vtt, "text/vtt")
    assert [(s.speaker, s.text, s.start_s) for s in segs] == [("Alice", "Bonjour à tous.", 5.0), ("Bob", "Salut.", 8.0)]


def test_parse_json():
    data = '{"version":"1.0","segments":[{"speaker":"Ann","startTime":0.5,"endTime":2,"body":"Hi"},{"startTime":2,"endTime":3,"body":" "}]}'
    segs = rss.parse_transcript(data, "application/json")
    assert [(s.speaker, s.text, s.start_s, s.duration_s) for s in segs] == [("Ann", "Hi", 0.5, 1.5)]


def test_parse_plain_and_html():
    assert [s.text for s in rss.parse_transcript("Para one.\n\nPara two.", "text/plain")] == ["Para one.", "Para two."]
    html = "<html><body><nav>Menu</nav><p>First.</p><p>Second.</p></body></html>"
    assert [s.text for s in rss.parse_transcript(html, "text/html")] == ["First.", "Second."]


def test_find_transcript_tries_next_format_when_one_fails():
    def fake_get(url):
        if url == "https://feed.host/rss":
            return FEED
        if url.endswith(".vtt"):
            return None  # broken link
        if url.endswith(".srt"):
            return "1\n00:00:00,000 --> 00:00:02,000\nFrom the SRT.\n"
        raise AssertionError(url)

    with patch.object(rss, "_get_text", side_effect=fake_get):
        t = rss.find_transcript("https://feed.host/rss", "https://cdn.host/ep12.mp3", None)
    assert t is not None and t.language == "fr"
    assert t.video_id == "https://cdn.host/ep12.mp3"
    assert t.segments[0].text == "From the SRT."


def test_find_transcript_never_raises():
    with patch.object(rss, "_get_text", side_effect=RuntimeError("boom")):
        assert rss.find_transcript("https://feed.host/rss", "https://cdn.host/ep12.mp3", "x") is None
