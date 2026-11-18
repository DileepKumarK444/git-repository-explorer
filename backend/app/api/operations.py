from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import repo_root
from app.schemas.operations import (StashBody, StashCreateBody, TagCreateBody, TagDeleteBody, CommitBody, CreateBranchBody, DeleteBranchBody, DiscardBody, NameBody,
                                    PathsBody, RenameBody)
from app.services.git.validate import safe_rev  # noqa: F401  (re-exported for symmetry with other routers)
from app.services.operations import service as ops
from app.services.stashes import service as stashes
from app.services.tags import service as tags

router = APIRouter(prefix="/api/ops")
Root = Depends(repo_root)


def _run(fn, *args, **kw):
    try:
        return fn(*args, **kw)
    except ops.OperationError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    except ValueError as exc:  # validation helpers (bad refs / paths)
        raise HTTPException(400, str(exc)) from exc


@router.post("/stage")
def stage(body: PathsBody, root: Path = Root):
    _run(ops.stage, root, body.paths); return {"ok": True}


@router.post("/unstage")
def unstage(body: PathsBody, root: Path = Root):
    _run(ops.unstage, root, body.paths); return {"ok": True}


@router.post("/stage-all")
def stage_all(root: Path = Root):
    _run(ops.stage_all, root); return {"ok": True}


@router.post("/unstage-all")
def unstage_all(root: Path = Root):
    _run(ops.unstage_all, root); return {"ok": True}


@router.post("/discard")
def discard(body: DiscardBody, root: Path = Root):
    return _run(ops.discard, root, body.paths, body.confirm)


@router.post("/commit")
def commit(body: CommitBody, root: Path = Root):
    return _run(ops.commit, root, body.message, body.description)


@router.post("/branches/create")
def create_branch(body: CreateBranchBody, root: Path = Root):
    _run(ops.create_branch, root, body.name, body.start, body.checkout); return {"ok": True}


@router.post("/branches/checkout")
def checkout(body: NameBody, root: Path = Root):
    return _run(ops.checkout, root, body.name)


@router.post("/branches/rename")
def rename(body: RenameBody, root: Path = Root):
    _run(ops.rename_branch, root, body.old, body.new); return {"ok": True}


@router.post("/branches/delete")
def delete(body: DeleteBranchBody, root: Path = Root):
    _run(ops.delete_branch, root, body.name, body.force); return {"ok": True}


@router.post("/fetch")
def fetch(root: Path = Root):
    return {"message": _run(ops.fetch, root)}


@router.post("/pull")
def pull(root: Path = Root):
    return {"message": _run(ops.pull, root)}


@router.post("/push")
def push(root: Path = Root):
    return {"message": _run(ops.push, root)}


@router.post("/tags/create")
def create_tag(body: TagCreateBody, root: Path = Root):
    _run(tags.create_tag, root, body.name, body.target, body.message); return {"ok": True}


@router.post("/tags/delete")
def delete_tag(body: TagDeleteBody, root: Path = Root):
    _run(tags.delete_tag, root, body.name, body.confirm); return {"ok": True}


@router.post("/stashes/create")
def create_stash(body: StashCreateBody, root: Path = Root):
    _run(stashes.create, root, body.message, body.include_untracked); return {"ok": True}


@router.post("/stashes/apply")
def apply_stash(body: StashBody, root: Path = Root):
    return {"message": _run(stashes.apply, root, body.index)}


@router.post("/stashes/pop")
def pop_stash(body: StashBody, root: Path = Root):
    return {"message": _run(stashes.pop, root, body.index)}


@router.post("/stashes/drop")
def drop_stash(body: StashBody, root: Path = Root):
    _run(stashes.drop, root, body.index, body.confirm); return {"ok": True}
