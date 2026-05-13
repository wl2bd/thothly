# ADR 002 — Ingestion YouTube : yt-dlp + youtube-transcript-api

**Date** : 2026-05-13  
**Statut** : Accepté

## Contexte

Thothly doit récupérer la liste des vidéos d'une playlist ou d'une chaîne YouTube, puis obtenir
les transcriptions textuelles de chaque vidéo. Deux approches générales existent :

1. YouTube Data API v3 (API officielle Google) + service de transcription séparé.
2. Bibliothèques open-source qui interagissent directement avec YouTube sans clé API.

## Décision

### Listing des vidéos : `yt-dlp` avec `extract_flat=True`

`yt-dlp` est retenu pour récupérer les métadonnées d'une playlist ou d'une chaîne sans aucune
clé API. L'option `extract_flat=True` retourne uniquement les métadonnées légères (id, titre,
durée, date d'upload) sans déclencher l'extraction complète ni aucun téléchargement. Cela permet
de lister rapidement des centaines de vidéos.

Alternatives écartées :
- **YouTube Data API v3** : nécessite un compte Google, une clé API, et est soumis à des quotas
  journaliers contraignants (10 000 unités/jour). Incompatible avec le principe self-hostable
  sans configuration obligatoire.
- **`pytube` / `pytubefix`** : moins maintenus, cassent régulièrement lors de mises à jour de
  YouTube. `yt-dlp` est activement maintenu et supporte une base de sites bien plus large.

### Récupération des sous-titres : `youtube-transcript-api`

`youtube-transcript-api` est retenu pour récupérer les sous-titres natifs (manuels ou
auto-générés) d'une vidéo via son identifiant. L'appel ne télécharge pas l'audio ni la vidéo :
il interroge directement l'API interne de sous-titres de YouTube, ce qui est très rapide et sans
coût réseau significatif.

Priorité de langue : français (`fr`) en premier, anglais (`en`) en fallback. Configurable à
l'appel de `fetch_transcript`.

Alternatives écartées :
- **Whisper / Voxtral** : nécessite de télécharger l'audio (plusieurs dizaines de Mo par vidéo),
  d'appeler une API payante, et d'attendre une transcription. Réservé au Ticket 9 comme fallback
  explicite quand aucun sous-titre natif n'existe.
- **YouTube Data API v3 captions** : les captions via l'API officielle ne sont accessibles que
  pour les vidéos dont on est propriétaire. Inutilisable en lecture générale.

### Séparation des deux bibliothèques

`yt-dlp` et `youtube-transcript-api` sont complémentaires et non redondants :
- `yt-dlp` est utilisé **uniquement** pour le listing de vidéos (`extract_flat`). Il pourrait
  techniquement télécharger des sous-titres, mais cela nécessite de télécharger partiellement la
  vidéo et produit des fichiers intermédiaires sur disque.
- `youtube-transcript-api` accède aux sous-titres **sans fichier temporaire**, directement depuis
  la requête HTTP, ce qui est plus propre pour notre usage.

## Conséquences

- Aucune clé API YouTube requise : `docker-compose up` fonctionne sans configuration
  supplémentaire pour les sources YouTube.
- Risque de rupture si YouTube modifie ses endpoints internes : les deux bibliothèques peuvent
  nécessiter des mises à jour. `yt-dlp` est mis à jour très fréquemment ; ce risque est accepté.
- Les vidéos sans sous-titres natifs (`TranscriptsDisabled`, `NoTranscriptFound`) retournent
  `None` — elles seront ignorées ou mises en attente jusqu'à l'implémentation du fallback Voxtral.
