# HANDOFF — reprise de session (Thothly MVP)

> But de ce fichier : permettre à Claude Code de reprendre le travail sur une **autre machine** (PC portable) sans la mémoire locale ni l'historique de conversation. Sur le portable : `claude`, puis « lis HANDOFF.md et reprends ».

## Où on en est (au 2026-06-06)

Branche : `feature/fresh-restart` (= `main`, même commit). Arbre git propre.

Le MVP **Discover → Review → Compile** est **fait et vérifié end-to-end en Docker**. Il ne reste qu'**une décision humaine** avant de clore le MVP (voir « Prochaine étape »).

## Ce que fait Thothly

Outil self-hostable qui compile des sources YouTube + blogs en un **EPUB propre** pour lecture offline sur e-reader (Boox). Ce n'est **PAS** du RAG / Q&A — c'est fait pour **lire**. Détails produit : `thothly-v1-brief.md`.

## Flow construit

`POST /jobs` → discovery (liste vidéos/articles, pas cher, BackgroundTasks) → état `reviewing` → l'utilisateur coche les items (frontend `/jobs/[id]`) → `POST /jobs/{id}/confirm` → compilation (seulement le sélectionné) → EPUB → `GET /jobs/{id}/download`.

États job : `pending → discovering → reviewing → processing → completed/failed`. Stockage **SQLite**, pas de Redis/Celery.

## Principes de conception (importants — ne pas casser)

- **Zéro LLM payant** : sous-titres YouTube natifs regroupés en paragraphes mais **jamais réécrits** ; vidéo sans sous-titres = **skippée** (pas de Voxtral) ; blog via RSS ou scraping `trafilatura`. EPUB rendu par **Pandoc** (CSS Instapaper réutilisé).
- **Une source = juste une URL**, type **auto-détecté** (`backend` → `sources/discovery.py::detect_kind`) : vidéo YouTube seule, playlist, chaîne (normalisée en `/videos`), blog (URL→RSS autodetect→scrape homepage). **Pas de dropdown de type** (feedback utilisateur).
- **Design frontend = job de l'utilisateur.** Ignorer l'esthétique, se concentrer sur la correction fonctionnelle.
- Pas de cérémonie ADR. Commits fréquents.

## Prochaine étape (LE point de décision)

1. `docker compose up --build`
2. Compiler quelque chose de réel
3. Ouvrir l'EPUB sur la **Boox** et **juger la lisibilité des sous-titres bruts**
   - Acceptable → le zéro-LLM tient, **MVP bouclé**
   - Trop rugueux → ajouter une étape de **cleanup Mistral optionnelle** à ce moment-là

C'est une décision qui demande les yeux de l'utilisateur sur la Boox — le code attend ce verdict.

## Vérification (au 2026-06-05)

Vérifié end-to-end en Docker : backend **44 pytest verts** ; `docker compose up --build` build les deux images (Pandoc 3.1.11 dans l'image backend) ; flow réel testé via la stack : POST job (blog_rss hnrss.org) → discovery a trouvé 20 items → reviewing → confirm 2 → processing → completed → EPUB valide 8KB téléchargé (`application/epub+zip`). Frontend sur `:3000`, proxy vers backend `:8000`.

## Pièges connus

- Le `data/thothly.db` hôte peut contenir des **vieux jobs d'un schéma abandonné** (ancien type de source `"youtube"`) qui font crasher `GET /jobs` (pydantic `literal_error` dans `_row_to_response`). Si `GET /jobs` renvoie 500 sur un checkout frais → supprimer `data/thothly.db` + `data/output` pour reset.

## Hors MVP (différé)

Cleanup Mistral, fallback Voxtral, polish Instapaper, README/docs de déploiement, ADRs formels.

## Stack technique repère

- Backend : FastAPI + SQLite, Pandoc, `yt-dlp`/sous-titres YouTube natifs, `feedparser`, `trafilatura`.
- Frontend : **Next.js 16 + base-ui** (lire `node_modules/next/dist/docs` avant de coder ; params async ; pas de `asChild`).
- Orchestration : `docker-compose.yml` à la racine.
