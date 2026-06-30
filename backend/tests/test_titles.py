from app.pipeline.titles import normalize_title


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
