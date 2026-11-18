# Architecture

```
frontend/ (React 19, Vite, TypeScript, Tailwind 4, Zustand, Monaco)  ->  /api  ->  backend/ (FastAPI)  ->  git CLI
```

## Backend (`backend/app`)
- `api/`: thin HTTP routes. `explorer.py` (reads), `operations.py` (writes, under `/api/ops`), `repositories.py`, `settings.py`, `deps.py` (resolves an opened repository).
- `services/git/runner.py`: the only place that starts `git`. `validate.py`: ref-name and path safety.
- `services/<area>/`: `repositories`, `files`, `branches`, `commits`, `diffs`, `search`, `tags`, `stashes`, `operations`, `analytics`. Services know Git; routes know HTTP.
- `core/security.py`: Host and Origin guard. `core/config.py`: data folder and Git path.
- Storage: one SQLite file (recent repositories, settings). Repository data is never copied.

## Frontend (`frontend/src`)
- `features/<screen>/`: one folder per screen. `components/`: shared UI (sidebar, command palette, diff viewer, dialogs, context menu).
- `store/`: `app` (open repository, sidebar, refresh tick), `settings` (synced with the backend), `toast`.
- `hooks/useFetch.ts`: small data loader that ignores stale responses and reloads on the Refresh command.
- Monaco is loaded lazily (Files, diffs) and bundled locally, so the app works offline.

## Conventions
- Read endpoints are `GET` and must not change a repository (tested). Anything that changes a repository is a `POST` under `/api/ops`.
- Destructive operations take an explicit `confirm` flag that the backend enforces.
- Long lists are paged or windowed (commits are windowed; search is capped at 500 matches).

## Adding an operation
1. Add a function to `services/operations/service.py` that validates input and calls the runner.
2. Add a route in `api/operations.py`, a client function in `frontend/src/services/api.ts`, and a test in `tests/test_operations.py` that checks both the effect and what must *not* change.
