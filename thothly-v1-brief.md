# Thothly — Brief V1

## Contexte

Projet personnel open-source, self-hostable. Objectif : un outil qui compile du contenu provenant de plusieurs sources en ligne (YouTube, blogs) en un EPUB propre et bien formaté, pour lecture offline sur liseuse.

**Positionnement** : différent de NotebookLM qui fait de la requête sur sources (RAG, Q&A). Thothly fait de la **lecture** : on compile, on formate, on lit. Slogan possible : "Compile ce que tu veux lire, peu importe d'où ça vient."

**Référence qualité** : l'expérience de lecture doit atteindre le standard Instapaper — typographie soignée, hiérarchie claire, table des matières fonctionnelle, sensation d'un livre curé et non d'une vidange de texte.

## Périmètre V1

### Dans le scope

- **Ingestion YouTube** : chaînes entières et playlists (pas de vidéos isolées). Priorité absolue aux sous-titres natifs via `youtube-transcript-api`. Fallback Voxtral (API Mistral) uniquement quand les sous-titres sont absents.
- **Ingestion Blogs** : flux RSS quand disponibles, sinon scraping article-par-article via `trafilatura` à partir d'une URL de blog ou d'un sitemap.
- **Cleanup léger des transcripts YouTube** via Mistral Small (ou équivalent économique) : suppression des "euh", "à propos", répétitions, restauration de la ponctuation, segmentation en paragraphes lisibles. **Pas d'éditorial** — pas de réécriture, pas de résumé, pas de titrage ambitieux.
- **Compilation multi-sources** : un job unique peut combiner plusieurs sources hétérogènes (ex. : 1 playlist YouTube + 2 blogs) en un seul EPUB de sortie.
- **Génération EPUB** : Pandoc avec CSS custom pour respecter le standard Instapaper. TOC cliquable, sauts de chapitre propres, attribution des sources, typographie travaillée.
- **Self-hostable** : `docker-compose up` doit tout faire tourner. Pas d'auth, pas de comptes utilisateurs. Configuration via `.env`.

### Hors scope V1

- **Audio / podcasts** → V2. L'architecture ne doit pas empêcher leur ajout futur, mais ne pas les implémenter maintenant.
- **Upload de documents** comme input → V2 ou jamais.
- **Travail éditorial avancé** (titrage par LLM, restructuration, résumés) → V2.
- **Sign-up, comptes utilisateurs, paywall, quotas par utilisateur** → V2 si SaaS-ification.
- **Hébergement SaaS** → décision reportée. La V1 est pensée pour tourner sur la machine de l'utilisateur ou son VPS.

## Stack technique

- **Frontend** : Next.js 15+ (App Router), Tailwind CSS, shadcn/ui, TypeScript.
- **Backend** : FastAPI (Python 3.11+), gestion des dépendances avec `uv`.
- **Exécution des jobs** : FastAPI `BackgroundTasks` + SQLite pour l'état des jobs. Pas de Redis, pas de Celery, pas de queue externe en V1.
- **Stockage** : système de fichiers local monté en volume Docker (`./data` pour SQLite + EPUBs générés).
- **APIs externes** :
  - **Mistral API** pour Voxtral (transcription fallback) et Mistral Small (cleanup).
  - Tout configurable via `.env`.
- **Bibliothèques clés** :
  - `yt-dlp` — métadonnées YouTube (listes de vidéos dans une chaîne/playlist).
  - `youtube-transcript-api` — récupération des sous-titres natifs sans télécharger la vidéo.
  - `feedparser` — flux RSS pour les blogs.
  - `trafilatura` — extraction propre du contenu principal d'un article HTML.
  - `pandoc` — génération EPUB à partir de Markdown ou HTML (invoqué via subprocess).

## Architecture du repo

```
thothly/
├── docker-compose.yml
├── .env.example
├── README.md
├── frontend/                    # Next.js + shadcn
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── package.json
├── backend/                     # FastAPI + uv
│   ├── app/
│   │   ├── api/                 # routes HTTP
│   │   ├── sources/             # ingestion par type de source
│   │   │   ├── youtube.py
│   │   │   └── blog.py
│   │   ├── pipeline/            # cleanup, normalisation
│   │   ├── render/              # pandoc, CSS, génération EPUB
│   │   ├── jobs/                # BackgroundTasks + état SQLite
│   │   └── core/                # config, settings, logging
│   ├── tests/
│   ├── pyproject.toml
│   └── Dockerfile
└── docs/
    ├── architecture.md
    └── adr/                     # Architecture Decision Records
```

## Premier ticket : scaffolding uniquement

**Objectif** : un squelette qui tourne, sans logique métier.

1. Créer la structure de dossiers ci-dessus.
2. Initialiser `frontend/` avec `pnpm create next-app@latest` (TypeScript, App Router, Tailwind).
3. Installer et configurer shadcn/ui (`npx shadcn@latest init`).
4. Initialiser `backend/` avec `uv init` + FastAPI + uvicorn comme dépendances.
5. Backend : implémenter un seul endpoint `GET /health` qui retourne `{"status": "ok", "version": "0.0.1"}`.
6. Frontend : page d'accueil minimaliste qui fetch `/health` côté serveur et affiche `Backend status: ok` (ou une erreur explicite si ko).
7. `docker-compose.yml` avec deux services :
   - `frontend` exposé sur :3000
   - `backend` exposé sur :8000, avec volume `./data` monté
   - Networking interne pour que frontend puisse appeler backend
8. `README.md` racine avec : description du projet, prérequis (Docker, Docker Compose), commande `docker-compose up`, ce qu'on est censé voir à l'écran.
9. `.gitignore` complet (node_modules, .venv, .env, data/*, sauf .gitkeep).
10. `.env.example` documenté avec les clés API attendues (`MISTRAL_API_KEY`).
11. Commit initial unique avec message `feat: initial scaffolding`.

**Critère d'acceptation** : sur un checkout vierge, `cp .env.example .env` puis `docker-compose up` doit produire un frontend accessible sur localhost:3000 affichant "Backend status: ok".

**Ne pas implémenter** : aucune ingestion, aucune génération EPUB, aucun appel à Mistral. Le but est uniquement de poser le squelette stable.

## Contraintes générales (à respecter dès le scaffolding)

- Pas de code commenté laissé en place.
- Chaque fichier a une responsabilité claire et unique.
- Toutes les variables d'environnement documentées dans `.env.example`.
- README explique le pourquoi de l'architecture, pas seulement le comment de la commande.
- Commits explicites, en français ou anglais cohérents avec la convention du repo (préfixe `feat:`, `fix:`, `chore:`, `docs:`).
- À partir du deuxième ticket : un ADR (Architecture Decision Record) court par décision technique non triviale, dans `docs/adr/`.
- Tests pytest pour le backend dès qu'il y a de la logique. Pas de tests sur le scaffolding.

## Ordre des tickets V1 (pour référence — ne pas implémenter avant validation du scaffolding)

1. Scaffolding (ci-dessus).
2. Endpoint backend `POST /jobs` qui accepte une liste de sources et crée un job en SQLite.
3. Source YouTube : récupération des sous-titres natifs pour une playlist.
4. Source Blog : extraction d'articles via RSS.
5. Cleanup léger via Mistral Small.
6. Compilation Markdown intermédiaire multi-sources.
7. Génération EPUB via Pandoc + CSS de base.
8. CSS EPUB travaillé pour atteindre le standard Instapaper. **Tester sur Boox dès cette étape.**
9. Fallback Voxtral pour les vidéos sans sous-titres.
10. Source Blog : scraping `trafilatura` quand pas de RSS.
11. Polish frontend (formulaire de soumission, suivi de job, téléchargement EPUB).
12. README final, documentation déploiement.
