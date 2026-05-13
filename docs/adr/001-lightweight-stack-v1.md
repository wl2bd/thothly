# ADR 001 — Lightweight stack V1 : SQLite + BackgroundTasks, pas de queue externe

**Date** : 2026-05-13  
**Statut** : Accepté

## Contexte

Thothly V1 est un outil self-hostable mono-utilisateur. Les jobs (compilation de sources en EPUB)
durent quelques secondes à quelques minutes selon la taille des sources et la disponibilité de
l'API Mistral. Il faut un mécanisme pour créer des jobs, persister leur état et les exécuter en
arrière-plan sans bloquer la réponse HTTP.

## Décision

### Persistance : SQLite (stdlib `sqlite3`)

- SQLite est embarqué dans Python — aucune dépendance externe, aucun process à gérer.
- Le fichier `thothly.db` est monté dans `./data` (volume Docker) : il survit aux redémarrages
  du container sans configuration supplémentaire.
- Connexion synchrone avec `check_same_thread=False` : FastAPI démarre uvicorn en mode
  multi-threaded (workers). `BackgroundTasks` exécute ses callbacks dans ce même pool de threads.
  `check_same_thread=False` est nécessaire pour que la connexion soit réutilisable depuis
  n'importe quel thread ; les écritures restent sérialisées par le verrou interne de SQLite, ce
  qui est suffisant en mono-utilisateur.
- `aiosqlite` (async) n'est pas retenu : les I/O SQLite sont quasi-instantanées à cette échelle,
  et l'overhead de bridger l'event loop asyncio pour chaque requête DB n'apporte rien.

### Exécution asynchrone : FastAPI `BackgroundTasks`

- `BackgroundTasks` exécute une fonction Python dans le pool de threads uvicorn après que la
  réponse HTTP a été envoyée. C'est suffisant pour des jobs CPU-light + I/O réseau.
- Pas de Redis, pas de Celery, pas de RQ, pas de ARQ : ces outils résolvent des problèmes
  (durabilité inter-process, workers distribués, retry sophistiqué, scheduling) que V1 n'a pas.
  Un utilisateur qui fait `docker-compose up` n'a pas à gérer un broker.
- Limite connue et acceptée : si le process uvicorn redémarre, les jobs `processing` en cours
  sont perdus. V2 pourra ajouter un mécanisme de récupération si nécessaire.

### Connexion SQLite : une connexion par requête

Chaque appel à `get_connection()` ouvre une nouvelle connexion. C'est intentionnel :
- Évite les problèmes de connexion partagée entre threads sans pooling.
- SQLite est suffisamment léger pour que l'overhead d'ouverture soit négligeable.
- Un pool de connexions (ex. via SQLAlchemy) serait over-engineered pour V1.

## Conséquences

- Toute logique future qui a besoin d'accéder à la DB doit passer par `app.core.database.get_connection()`.
- Si la charge augmente (SaaS multi-utilisateurs), migrer vers PostgreSQL + Celery sera la voie
  naturelle. La séparation `repository.py` / `router.py` / `models.py` facilite ce remplacement.
- Les migrations de schéma se font manuellement pour l'instant (`CREATE TABLE IF NOT EXISTS`).
  Alembic sera introduit dès qu'une migration destructive sera nécessaire.
