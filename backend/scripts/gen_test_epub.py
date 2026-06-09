"""Generate a test EPUB through the real Thothly pipeline for auditing."""

from datetime import datetime, timezone
from pathlib import Path

from app.pipeline.compiler import (
    compile_book,
    demote_headings,
    html_to_markdown,
    strip_leading_title,
    transcript_to_markdown,
)
from app.pipeline.models import CompiledChapter
from app.render.epub import render_epub
from app.sources.models import Chapter, Transcript, TranscriptSegment

# --- Chapter 1: a scraped blog article (HTML -> semantic markdown) ---------
ARTICLE_HTML = """
<h1>La patience comme discipline</h1>
<p>La patience n'est pas l'attente passive. Elle est une <strong>tension
ordonnée</strong> vers ce qui n'est pas encore là, et <em>cela change
tout</em>. On la confond souvent avec la résignation.</p>
<h2>Les racines anciennes</h2>
<p>Les stoïciens en parlaient déjà. Voici ce qu'en disait Sénèque&nbsp;:</p>
<blockquote><p>Ce n'est pas parce que les choses sont difficiles que nous
n'osons pas, c'est parce que nous n'osons pas qu'elles sont difficiles.</p></blockquote>
<h2>Une pratique quotidienne</h2>
<p>Quelques repères concrets&nbsp;:</p>
<ul>
  <li>Nommer l'impatience quand elle surgit.</li>
  <li>Respirer avant de répondre.</li>
  <li>Distinguer l'urgent de l'important.</li>
</ul>
<p>On peut aussi le formaliser. Voir <a href="https://example.org/patience">cette
ressource</a> pour aller plus loin.</p>
<pre><code>def patienter(x):
    return attendre(x) and agir(x)</code></pre>
<figure>
  <img src="https://example.org/img/sablier.png" alt="Un sablier ancien posé sur une table de bois" />
  <figcaption>Le sablier, mesure du temps qui s'écoule.</figcaption>
</figure>
"""

article_md = html_to_markdown(ARTICLE_HTML)
article_md = strip_leading_title(article_md, "La patience comme discipline")
article_md = demote_headings(article_md, floor=2)

chapter_blog = CompiledChapter(
    title="La patience comme discipline",
    source_type="blog",
    source_url="https://example.org/patience",
    author="Marc Aurèle",
    published_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
    content_md=article_md,
)

# --- Chapter 2: a YouTube transcript with chapters (punctuated) ------------
sentences = (
    "La foi est une vertu cardinale qui structure toute la vie intérieure. "
    "Elle ne se réduit pas à une simple croyance abstraite. "
    "Au contraire, elle engage l'être tout entier dans une confiance vécue. "
)
transcript = Transcript(
    video_id="abc123",
    language="fr",
    segments=[
        TranscriptSegment(text=sentences * 4, start_s=0.0, duration_s=60.0),
        TranscriptSegment(text=sentences * 4, start_s=120.0, duration_s=60.0),
    ],
    chapters=[
        Chapter(title="Introduction à la foi", start_s=0.0, end_s=110.0),
        Chapter(title="La foi vécue", start_s=110.0, end_s=240.0),
    ],
)
chapter_yt = CompiledChapter(
    title="Comprendre la foi",
    source_type="youtube",
    source_url="https://www.youtube.com/watch?v=abc123",
    author="Chaîne Théologie",
    published_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
    content_md=transcript_to_markdown(transcript),
)

book = compile_book([chapter_blog, chapter_yt], title="Récits et analyses théologiques")
book.preface = (
    "Ce recueil rassemble deux réflexions sur la vie intérieure : "
    "l'une sur la patience, l'autre sur la foi. Bonne lecture."
)

out = Path(__file__).resolve().parent.parent / "test_output" / "audit.epub"
render_epub(book, out)
print(f"EPUB written: {out}")

# Also dump the intermediate markdown for inspection.
md_out = out.with_suffix(".md")
md_out.write_text(book.to_markdown(), encoding="utf-8")
print(f"Markdown written: {md_out}")
