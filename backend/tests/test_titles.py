from app.pipeline.titles import chapter_title, disambiguate_titles, host_of, normalize_title
from app.sources.models import DiscoveredItem


# ── episode-number prefixes ──────────────────────────────────────────────────

def test_strips_hash_episode_prefix():
    assert normalize_title("#2519 - Scott Eastwood") == "Scott Eastwood"


def test_strips_worded_episode_prefixes():
    assert normalize_title("Ep. 42: The Future of AI") == "The Future of AI"
    assert normalize_title("Episode 12 - Origins") == "Origins"
    assert normalize_title("Part 3: The Return") == "The Return"


def test_keeps_leading_number_that_is_not_an_episode_marker():
    # No separator after the number → it's part of the title, never stripped.
    assert normalize_title("12 Rules for Life") == "12 Rules for Life"


def test_keeps_mid_title_episode_number():
    raw = "JRE MMA Show #181 with Justin Gaethje & Trevor Wittman"
    assert normalize_title(raw) == raw


# ── channel / platform suffixes ──────────────────────────────────────────────

def test_strips_trailing_pipe_channel_tag():
    raw = "What Was Happening Before the Big Bang? w/Brian Greene | Joe Rogan"
    assert normalize_title(raw) == "What Was Happening Before the Big Bang? w/Brian Greene"


def test_strips_youtube_platform_tag():
    assert normalize_title("How GPT-4 Works - YouTube") == "How GPT-4 Works"


# ── de-shouting (segment-wise) ───────────────────────────────────────────────

def test_deshouts_a_shouted_segment_only():
    # The shouted hook is tidied; the already-clean subtitle is left as-is.
    assert normalize_title("SACRIFICE - Motivational Speech") == "Sacrifice - Motivational Speech"


def test_deshouts_multiword_shout_with_small_words_lowercased():
    raw = "KILL YOUR EXCUSES - Motivational Speech"
    assert normalize_title(raw) == "Kill Your Excuses - Motivational Speech"


def test_deshout_handles_apostrophes_and_censor_stars():
    raw = "IT'S SUPPOSED TO BE F*CKING HARD BRO - Powerful Motivational Speeches Compilation"
    assert normalize_title(raw) == (
        "It's Supposed to Be F*cking Hard Bro - Powerful Motivational Speeches Compilation"
    )


# ── acronyms / mixed case are preserved (conservative) ───────────────────────

def test_preserves_acronyms_in_mixed_case_titles():
    for raw in (
        "Tim Dillon on Israel, Iran, AI, and Palantir",
        "The UN and the WHO Explained",
        "USA vs China: A Primer",
        "iPhone 16 Review",
    ):
        assert normalize_title(raw) == raw


def test_embedded_single_shout_is_left_alone():
    # A lone all-caps word inside an otherwise mixed-case title is NOT de-shouted
    # (the conservative choice: never risk lowercasing an acronym).
    raw = "Liver King's INSANE Bodycam Footage After Arrest"
    assert normalize_title(raw) == raw


# ── hygiene & safety ─────────────────────────────────────────────────────────

def test_collapses_whitespace_and_trims():
    assert normalize_title("  Hello    world  ") == "Hello world"


def test_never_returns_empty():
    # A title that is *only* a strippable prefix falls back to the raw title
    # rather than emptying the heading.
    assert normalize_title("#42 - ") == "#42 -"


# ── same title, different sites ──────────────────────────────────────────────

def _item(title: str, url: str, site_name: str | None = None, index: int = 0,
          item_type: str = "blog") -> DiscoveredItem:
    return DiscoveredItem(
        title=title, url=url, item_type=item_type, source_index=index, item_index=0,
        site_name=site_name,
    )


def _by_host(item: DiscoveredItem) -> tuple[str, str]:
    host = host_of(item.url)
    return host, item.site_name or host


def _suffixes(items):
    return [i.title_suffix for i in items]


def test_names_the_site_when_two_sources_share_a_title():
    items = [
        _item("Stoicism", "https://en.wikipedia.org/wiki/Stoicism", "Wikipedia"),
        _item("Stoicism", "https://plato.stanford.edu/entries/stoicism/",
              "Stanford Encyclopedia of Philosophy", 1),
    ]
    disambiguate_titles(items, _by_host)
    assert _suffixes(items) == ["Wikipedia", "Stanford Encyclopedia of Philosophy"]
    # The title itself stays raw: transcript lookups match on it.
    assert [i.title for i in items] == ["Stoicism", "Stoicism"]


def test_a_collision_ignores_case_spacing_and_punctuation():
    items = [
        _item("Stoicism.", "https://a.example/x", "A"),
        _item("  stoicism ", "https://b.example/y", "B", 1),
    ]
    disambiguate_titles(items, _by_host)
    assert _suffixes(items) == ["A", "B"]


def test_unique_titles_are_left_alone():
    items = [
        _item("Stoicism", "https://a.example/x", "A"),
        _item("Epicureanism", "https://b.example/y", "B", 1),
    ]
    disambiguate_titles(items, _by_host)
    assert _suffixes(items) == [None, None]


def test_one_origin_under_two_names_is_still_one_origin():
    # A blog's feed (no site name) and one of its pages pasted directly.
    items = [
        _item("Intro", "https://blog.example/one"),
        _item("Intro", "https://blog.example/one", "Example Blog", 1),
    ]
    disambiguate_titles(items, _by_host)
    assert _suffixes(items) == [None, None]


def test_the_chapter_heading_carries_the_suffix_after_tidying():
    item = _item("KILL YOUR EXCUSES - MOTIVATIONAL SPEECH | Some Channel", "https://youtube.com/watch?v=x")
    item.title_suffix = "BBC"
    assert chapter_title(item) == "Kill Your Excuses - Motivational Speech (BBC)"
    item.title_suffix = None
    assert chapter_title(item) == "Kill Your Excuses - Motivational Speech"
