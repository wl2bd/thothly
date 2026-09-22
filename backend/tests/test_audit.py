"""The audit's job is triage: a clean chapter must not be flagged, and each
defect must raise its own flag. Both halves matter — a check that cries wolf
gets ignored, and a silent one is worse than none."""

from app.pipeline.audit import MECHANICAL_RHYTHM, audit_chapter, split_chapters

# Varied paragraph lengths, no medium talk, no cues: the shape of real prose.
CLEAN = (
    "La patience n'est pas l'attente passive.\n\n"
    "Elle est une tension ordonnée vers ce qui n'est pas encore là, et cela "
    "change tout. On la confond souvent avec la résignation, alors qu'elle en "
    "est l'exact contraire: un refus tenu dans la durée.\n\n"
    "Court.\n\n"
    "Le reste suit."
)


def test_a_faithful_chapter_raises_nothing():
    assert audit_chapter("T", CLEAN, CLEAN).clean


def test_dropped_content_is_caught():
    half = "Elle est une tension ordonnée vers ce qui n'est pas encore là."
    audit = audit_chapter("T", CLEAN, half)
    assert any("lost" in f for f in audit.flags)


def test_inflated_content_is_caught():
    padded = CLEAN + " " + " ".join(f"mot{i}" for i in range(200))
    assert any("added" in f for f in audit_chapter("T", CLEAN, padded).flags)


def test_dropped_figures_are_named():
    src = CLEAN + "\n\nIl y avait 1 500 personnes en 1789."
    out = CLEAN + "\n\nIl y avait beaucoup de personnes à l'époque."
    audit = audit_chapter("T", src, out)
    assert any("1500" in f and "1789" in f for f in audit.flags)


def test_thousands_separators_do_not_read_as_a_loss():
    """"1 500" reformatted as "1,500" is the same figure, not a dropped one."""
    src = CLEAN + "\n\nIl y avait 1 500 personnes."
    out = CLEAN + "\n\nIl y avait 1,500 personnes."
    assert not audit_chapter("T", src, out).lost_numbers


def test_model_preamble_is_caught():
    out = "Voici le texte corrigé:\n\n" + CLEAN
    assert any("preamble" in f for f in audit_chapter("T", CLEAN, out).flags)


def test_preamble_words_mid_chapter_are_the_author_s():
    """"Voici" in the middle of a sentence is speech, not a model answering."""
    out = CLEAN + "\n\nEt voici le texte de Sénèque sur ce point précis."
    assert not any("preamble" in f for f in audit_chapter("T", CLEAN, out).flags)


def test_sound_cues_and_medium_talk_are_caught():
    out = CLEAN + "\n\n[Musique] N'oubliez pas de vous abonner à la chaîne."
    flags = audit_chapter("T", CLEAN, out).flags
    assert any("sound cues" in f for f in flags)
    assert any("viewer" in f for f in flags)


def test_sponsor_read_is_caught():
    out = CLEAN + "\n\nCette vidéo est sponsorisée par NordVPN, avec le code THOTH."
    assert any("sponsor" in f for f in audit_chapter("T", CLEAN, out).flags)


def test_mechanically_cut_paragraphs_are_caught():
    """Paragraphs of near-identical length can only come from a character
    counter — a defect spotted in a real EPUB."""
    para = " ".join(["mot"] * 100)
    mechanical = "\n\n".join([para] * 6)
    audit = audit_chapter("T", mechanical, mechanical)
    assert audit.para_rhythm < MECHANICAL_RHYTHM
    assert any("meaning" in f for f in audit.flags)


def test_split_chapters_drops_front_matter():
    book = (
        "# Sources\n\n- [A](http://a)\n\n"
        "# Preface\n\nUne préface.\n\n"
        "# Chapitre un\n\nCorps un.\n\n## Section\n\nSuite.\n\n"
        "# Chapitre deux\n\nCorps deux.\n"
    )
    chapters = split_chapters(book)
    assert set(chapters) == {"Chapitre un", "Chapitre deux"}
    assert "## Section" in chapters["Chapitre un"]
    assert chapters["Chapitre deux"] == "Corps deux."


def test_the_judge_sees_each_edited_passage_next_to_its_own_source():
    from app.pipeline.audit_judge import _passages

    source = "one two three four five six seven\n\neight nine ten eleven twelve"
    edited = (
        "::: {.source-attribution}\n*Source: x*\n:::\n\n## A heading\n\n"
        "One, two, three, four.\n\nEleven twelve.\n\nEntirely new words here."
    )
    passages = _passages(source, edited)
    # Chrome (source block, heading) is skipped; an invented paragraph has no source.
    assert [p for p, _ in passages] == ["One, two, three, four.", "Eleven twelve.", "Entirely new words here."]
    assert "one two three four" in passages[0][1]
    assert "eleven twelve" in passages[1][1]
    assert passages[2][1] is None
