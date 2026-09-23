"""Content language: normalising tags, detecting it, and the book's chrome.

A compilation is written in the language of its content: each chapter carries
the language its source is in, the book takes the dominant one, and the words
Thothly adds itself (the Sources index, the Preface heading, attribution
labels, speaker labels) follow the book. Languages without a catalogue entry
fall back to English chrome; the content itself is never translated.
"""

import re
from collections import Counter

FALLBACK = "en"

# The chrome Thothly writes into a book, per language.
_CHROME: dict[str, dict[str, str]] = {
    "en": {
        "sources": "Sources", "preface": "Preface", "source": "Source",
        "author": "Author", "date": "Date", "speaker": "Speaker",
        "toc": "Table of contents", "start": "Start of content",
    },
    "fr": {
        "sources": "Sources", "preface": "Préface", "source": "Source",
        "author": "Auteur", "date": "Date", "speaker": "Intervenant",
        "toc": "Table des matières", "start": "Début du contenu",
    },
    "es": {
        "sources": "Fuentes", "preface": "Prefacio", "source": "Fuente",
        "author": "Autor", "date": "Fecha", "speaker": "Interlocutor",
        "toc": "Índice", "start": "Inicio del contenido",
    },
    "de": {
        "sources": "Quellen", "preface": "Vorwort", "source": "Quelle",
        "author": "Autor", "date": "Datum", "speaker": "Sprecher",
        "toc": "Inhaltsverzeichnis", "start": "Beginn des Inhalts",
    },
    "it": {
        "sources": "Fonti", "preface": "Prefazione", "source": "Fonte",
        "author": "Autore", "date": "Data", "speaker": "Interlocutore",
        "toc": "Indice", "start": "Inizio del contenuto",
    },
    "pt": {
        "sources": "Fontes", "preface": "Prefácio", "source": "Fonte",
        "author": "Autor", "date": "Data", "speaker": "Orador",
        "toc": "Índice", "start": "Início do conteúdo",
    },
}


def chrome(language: str | None) -> dict[str, str]:
    """The chrome labels for a book language, English when there are none."""
    return _CHROME.get(language or FALLBACK, _CHROME[FALLBACK])


_TAG = re.compile(r"^([a-z]{2,3})(?:[-_][a-z0-9]+)*$")


def normalize_language(tag: str | None) -> str | None:
    """A source's language tag reduced to its primary subtag ("fr-FR" -> "fr",
    YouTube's "en-orig" -> "en"); None when there is no usable tag."""
    match = _TAG.match((tag or "").strip().lower())
    return match.group(1) if match else None


# ponytail: a stopword vote, reliable on chapter-length text for these seven
# languages; swap in a detection library if other languages or short texts
# need it. Only used when the source itself declares no language.
_STOPWORDS: dict[str, set[str]] = {
    "en": set("the and of to is in that it for you with this was are be on not have but they".split()),
    "fr": set("le la les et des est une que qui dans pour pas sur vous avec il ce du au sont".split()),
    "es": set("el la los las y de que en es un una por con para no se del lo como más".split()),
    "de": set("der die das und ist nicht mit sich des auf für ein eine dem den zu von auch".split()),
    "it": set("il la che di e è per non un una sono con del della gli le si come più".split()),
    "pt": set("o a os as e de que em é um uma para com não do da dos se por mais".split()),
    "nl": set("de het een en van is dat niet op te zijn met voor die er maar ook als".split()),
}
_WORD = re.compile(r"[^\W\d_]+", re.UNICODE)
_MIN_HITS = 20  # too few stopwords to call it: leave the language unknown


def detect_language(text: str) -> str | None:
    words = Counter(w.lower() for w in _WORD.findall(text[:20000]))
    scores = {lang: sum(words[w] for w in stop) for lang, stop in _STOPWORDS.items()}
    best, hits = max(scores.items(), key=lambda kv: kv[1])
    return best if hits >= _MIN_HITS else None


def dominant_language(pairs: list[tuple[str | None, int]]) -> str:
    """The book language: the one carrying the most text across its chapters
    (pairs of language and text length), English when none is known."""
    weights: Counter[str] = Counter()
    for language, size in pairs:
        if language:
            weights[language] += size
    return weights.most_common(1)[0][0] if weights else FALLBACK
