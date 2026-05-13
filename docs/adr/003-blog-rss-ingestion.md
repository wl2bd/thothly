# ADR 003 — Ingestion Blog : feedparser pour les flux RSS

**Date** : 2026-05-13  
**Statut** : Accepté

## Contexte

Thothly doit ingérer des articles depuis des blogs. La majorité des blogs publient un flux RSS
ou Atom. Quand ce flux contient le contenu complet des articles (`<content:encoded>` ou
`<content>`), aucun accès HTTP supplémentaire n'est nécessaire pour obtenir le texte.

## Décision

### Parsing RSS/Atom : `feedparser`

`feedparser` est la bibliothèque de référence Python pour parser les flux RSS, Atom et RDF.
Elle gère les nombreuses variantes du format (RSS 0.9x, RSS 1.0, RSS 2.0, Atom 0.3, Atom 1.0),
les encodages non standard, et expose une interface uniforme indépendamment du format source.

Alternatives écartées :
- **Parser XML manuellement** (`xml.etree.ElementTree`) : fragile face aux variantes du format,
  duplication de ce que `feedparser` fait déjà bien.
- **`atoma`** : moins mature et moins maintenu que `feedparser`.

### Priorité de contenu : `content[0].value` > `summary`

feedparser expose deux champs pour le texte d'un article :
- `entry.content` : liste d'objets avec `.value` (HTML complet, quand le flux l'inclut).
- `entry.summary` : résumé ou extrait, souvent tronqué.

La fonction `_entry_to_article` préfère `content[0].value` quand disponible et se rabat sur
`summary` sinon. Les articles sans aucun texte dans le flux reçoivent `content_html=""` et
seront ignorés ou récupérés via scraping lors du Ticket 10.

### Hors scope : scraping quand pas de RSS

Les blogs sans flux RSS et la récupération du contenu complet quand le flux ne le fournit pas
sont traités au Ticket 10 via `trafilatura`. L'interface `Article.content_html` est déjà
définie pour accueillir le résultat de cette deuxième source sans modifier les modèles.

## Conséquences

- `list_feed()` ne fait qu'un seul appel réseau (la récupération du flux) pour potentiellement
  des dizaines d'articles, ce qui est très efficace.
- Les articles avec `content_html=""` doivent être traités comme incomplets par le pipeline ;
  le Ticket 10 ajoutera un mécanisme de récupération pour ces cas.
- feedparser lève `bozo=True` sur les flux mal formés mais tente quand même de les parser ;
  on considère ce comportement correct pour la V1 (tolérance aux flux imparfaits).
