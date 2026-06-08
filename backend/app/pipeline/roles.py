"""LLM role registry.

A *role* is one faithful transform pass applied at compile time. Roles are
data here (id/label/description/scope + system prompt) so the same definitions
drive both the cleanup engine (`cleanup.py`) and the `GET /llm` catalogue the
review screen renders. Adding a role is: append a `Role` and teach `cleanup.py`
how to apply it.

All prompts insist on preserving the original language and not
adding/removing/summarising content (except `preface`, which is generative).
"""

from dataclasses import dataclass

# Role ids — stable identifiers stored on the job and sent by the frontend.
PUNCTUATE = "punctuate"
COPYEDIT = "copyedit"
SECTIONS = "sections"
PREFACE = "preface"


@dataclass(frozen=True)
class Role:
    id: str
    label: str
    description: str
    scope: str  # "item" (per chapter) | "book" (once, on the whole book)
    system_prompt: str


_PUNCTUATE_PROMPT = (
    "Tu es un éditeur de transcriptions. On te donne le texte brut d'une "
    "transcription automatique (sous-titres) sans ponctuation ni majuscules. "
    "Restaure la ponctuation, les majuscules et découpe le texte en paragraphes "
    "lisibles. Ne résume pas, n'ajoute rien et ne supprime aucun contenu : "
    "conserve tous les mots et leur ordre. Conserve la langue d'origine. "
    "Réponds uniquement avec le texte corrigé en Markdown (paragraphes séparés "
    "par une ligne vide), sans aucun commentaire."
)

_COPYEDIT_PROMPT = (
    "Tu es un correcteur. On te donne un texte déjà ponctué. Supprime les tics de "
    "langage et hésitations (euh, hum, ben, « voilà quoi », faux départs répétés), "
    "corrige les fautes évidentes de reconnaissance vocale et améliore légèrement "
    "la fluidité — sans changer le sens, sans résumer et sans ajouter d'idées. "
    "Conserve la langue d'origine, la structure en paragraphes et tout le "
    "formatage Markdown existant (gras **, italique *, liens [texte](url), "
    "listes, tableaux). Réponds uniquement avec le texte corrigé en Markdown, "
    "sans commentaire."
)

_SECTIONS_PROMPT = (
    "Tu es un éditeur. On te donne un texte continu (transcription ou article). "
    "Insère des titres de section de niveau 2 en Markdown (## Titre) là où le "
    "sujet change, pour structurer la lecture. N'ajoute, ne supprime et ne "
    "reformule aucun contenu en dehors de ces titres. Les titres doivent être "
    "courts et dans la langue du texte. Réponds uniquement avec le texte "
    "structuré en Markdown, sans commentaire."
)

_PREFACE_PROMPT = (
    "Tu es l'éditeur d'un recueil de lecture. On te donne le titre du livre et la "
    "liste de ses chapitres. Rédige une courte préface (2 à 4 paragraphes) qui "
    "présente le recueil et ce que le lecteur va y trouver. Écris dans la langue "
    "des titres, sur un ton sobre et éditorial. Réponds uniquement avec le texte "
    "de la préface en Markdown, sans titre ni commentaire."
)


# Order matters for item-scoped roles: punctuate first (creates sentences),
# then copyedit (cleans them), then sections (adds structure on top).
ROLES: list[Role] = [
    Role(
        id=PUNCTUATE,
        label="Ponctuation",
        description=(
            "Restaure la ponctuation et les paragraphes des transcriptions non "
            "ponctuées. N'agit que sur les vidéos signalées « à nettoyer »."
        ),
        scope="item",
        system_prompt=_PUNCTUATE_PROMPT,
    ),
    Role(
        id=COPYEDIT,
        label="Correction",
        description=(
            "Retire les tics de langage et corrige les fautes de reconnaissance "
            "vocale, sans changer le sens."
        ),
        scope="item",
        system_prompt=_COPYEDIT_PROMPT,
    ),
    Role(
        id=SECTIONS,
        label="Sections",
        description=(
            "Ajoute des titres de section pour les contenus sans structure "
            "(vidéos sans chapitres), pour une meilleure table des matières."
        ),
        scope="item",
        system_prompt=_SECTIONS_PROMPT,
    ),
    Role(
        id=PREFACE,
        label="Préface",
        description="Génère une courte préface en ouverture du livre.",
        scope="book",
        system_prompt=_PREFACE_PROMPT,
    ),
]

_BY_ID = {role.id: role for role in ROLES}


def get_role(role_id: str) -> Role | None:
    return _BY_ID.get(role_id)


def selected_item_roles(role_ids: list[str]) -> list[Role]:
    """Item-scoped roles among the selection, in canonical apply order."""
    chosen = set(role_ids)
    return [r for r in ROLES if r.scope == "item" and r.id in chosen]


def has_role(role_ids: list[str], role_id: str) -> bool:
    return role_id in set(role_ids)
