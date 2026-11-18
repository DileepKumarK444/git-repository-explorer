from __future__ import annotations

import subprocess
import sys

from fastapi import APIRouter, HTTPException

from app.schemas.repositories import FavouriteBody, PathBody
from app.services.git.runner import GitNotFoundError
from app.services.repositories import store
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
    """Open the native folder dialog (macOS). Elsewhere the UI asks for a pasted path."""
    if sys.platform != "darwin":
        raise HTTPException(501, "The native folder picker is only available on macOS. Paste the path instead.")
    script = 'POSIX path of (choose folder with prompt "Choose a Git repository")'
    proc = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=300)
    if proc.returncode != 0:
        return {"path": None}  # user cancelled
    return {"path": proc.stdout.strip().rstrip("/")}
