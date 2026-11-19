from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.repositories import FavouriteBody, PathBody
from app.services.git.runner import GitNotFoundError
from app.services.repositories import paths, store
from app.services.repositories.inspect import inspect_repo

router = APIRouter(prefix="/api")


@router.get("/repositories")
def list_repositories():
    """Recent and favourite repositories with live status (read-only)."""
    out = []
    for item in store.list_paths():
        try:
            info = inspect_repo(item["path"]).dict()
        except GitNotFoundError as exc:
            raise HTTPException(503, str(exc)) from exc
        out.append({**info, "favourite": item["favourite"], "opened_at": item["opened_at"],
                    "missing": not info["valid"]})
    return out


@router.post("/repositories/validate")
def validate(body: PathBody):
    """Check a folder without remembering it."""
    try:
        return inspect_repo(body.path).dict()
    except GitNotFoundError as exc:
        raise HTTPException(503, str(exc)) from exc


@router.post("/repositories/open")
def open_repository(body: PathBody):
    try:
        info = inspect_repo(body.path)
    except GitNotFoundError as exc:
        raise HTTPException(503, str(exc)) from exc
    if not info.valid:
        raise HTTPException(422, info.error)
    store.touch(info.root)
    return info.dict()


@router.post("/repositories/favourite")
def favourite(body: FavouriteBody):
    if not store.set_favourite(body.path, body.favourite):
        raise HTTPException(404, "That repository is not in your list.")
    return {"ok": True}


@router.post("/repositories/forget")
def forget(body: PathBody):
    """Remove from the recent list. The folder on disk is not touched."""
    if not store.remove(body.path):
        raise HTTPException(404, "That repository is not in your list.")
    return {"ok": True}


@router.post("/system/pick-folder")
def pick_folder():
    """Open the native folder dialog (macOS, Windows dialog via WSL, or zenity). Otherwise the UI asks for a pasted path."""
    try:
        return {"path": paths.pick_folder()}  # None = user cancelled
    except NotImplementedError as exc:
        raise HTTPException(501, str(exc)) from exc
