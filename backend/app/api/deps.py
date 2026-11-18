from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException, Query

from app.services.repositories import store


def repo_root(repo: str = Query(..., description="Root path of an opened repository")) -> Path:
    """Only repositories the user has opened are reachable through the API."""
    known = {item["path"] for item in store.list_paths()}
    if repo not in known:
        raise HTTPException(404, "That repository has not been opened. Open it from the dashboard first.")
    p = Path(repo)
    if not p.is_dir():
        raise HTTPException(404, f"'{repo}' no longer exists.")
    return p
