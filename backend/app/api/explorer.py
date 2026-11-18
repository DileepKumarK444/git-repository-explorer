from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import repo_root
from app.services.branches import service as branches
from app.services.commits import service as commits
from app.services.analytics import service as analytics
from app.services.diffs import service as diffs
from app.services.operations.service import OperationError
from app.services.search import service as search
from app.services.stashes import service as stashes
from app.services.tags import service as tags
from app.services.files import service as files
from app.services.git.runner import GitError
from app.services.repositories.overview import overview

router = APIRouter(prefix="/api")
Root = Depends(repo_root)


def _bad(exc: Exception, code: int = 400):
    return HTTPException(code, str(exc))


@router.get("/overview")
def get_overview(root: Path = Root):
    return {**overview(root), "recent": commits.log(root, limit=8, rev="HEAD")["commits"] if _has_head(root) else []}


def _has_head(root: Path) -> bool:
    from app.services.git.runner import GitRunner
    return GitRunner().run(["rev-parse", "--verify", "-q", "HEAD"], root, check=False).strip() != ""


@router.get("/files")
def list_files(root: Path = Root, ref: str | None = None):
    try:
        return files.list_files(root, ref)
    except ValueError as exc:
        raise _bad(exc)


@router.get("/files/content")
def file_content(path: str, root: Path = Root, ref: str | None = None):
    try:
        return files.read_file(root, path, ref)
    except ValueError as exc:
        raise _bad(exc)
    except FileNotFoundError as exc:
        raise _bad(exc, 404)
    except GitError as exc:
        raise HTTPException(404, f"'{path}' does not exist at {ref or 'the working tree'}.") from exc


@router.get("/files/blame")
def file_blame(path: str, root: Path = Root, ref: str | None = None):
    try:
        return files.blame(root, path, ref)
    except ValueError as exc:
        raise _bad(exc)
    except GitError as exc:
        raise HTTPException(404, "No blame available (file is untracked or has no history).") from exc


@router.get("/branches")
def get_branches(root: Path = Root):
    return branches.list_branches(root)


@router.get("/commits")
def get_commits(root: Path = Root, skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
                rev: str | None = None, author: str | None = None, q: str | None = None,
                since: str | None = None, until: str | None = None, path: str | None = None,
                hash: str | None = None):
    try:
        if hash:
            return commits.log(root, commit=hash)
        return commits.log(root, skip=skip, limit=limit, rev=rev, author=author, text=q,
                           since=since, until=until, path=path)
    except ValueError as exc:
        raise _bad(exc)
    except GitError as exc:
        if hash:
            return {"commits": [], "has_more": False}
        raise


@router.get("/commits/{rev:path}")
def get_commit(rev: str, root: Path = Root):
    try:
        return commits.detail(root, rev)
    except ValueError as exc:
        raise _bad(exc)
    except FileNotFoundError as exc:
        raise _bad(exc, 404)
    except GitError as exc:
        raise HTTPException(404, f"Commit '{rev}' not found.") from exc


@router.get("/changes")
def get_changes(root: Path = Root):
    return diffs.working_changes(root)


@router.get("/diff")
def get_diff(path: str, base: str, target: str, old_path: str | None = None, root: Path = Root):
    try:
        return diffs.file_pair(root, path, base, target, old_path)
    except ValueError as exc:
        raise _bad(exc)
    except GitError as exc:
        raise HTTPException(400, exc.stderr.strip() or str(exc)) from exc


@router.get("/compare")
def get_compare(base: str, target: str, direct: bool = False, root: Path = Root):
    try:
        return diffs.compare(root, base, target, direct=direct)
    except ValueError as exc:
        raise _bad(exc)
    except GitError as exc:
        raise HTTPException(404, f"Could not compare: {exc.stderr.strip() or exc}") from exc


# ---- search, tags, stashes, insights ----------------------------------------------------------------

@router.get("/search/content")
def search_content(q: str, root: Path = Root, case: bool = False, word: bool = False, regex: bool = False,
                   types: str = "", exclude: str | None = None, context: int = Query(0, ge=0, le=5)):
    try:
        return search.search_content(root, q, case=case, word=word, regex=regex,
                                     types=[t for t in types.split(",") if t],
                                     exclude=None if exclude is None else exclude.split(","), context=context)
    except ValueError as exc:
        raise _bad(exc)


@router.get("/search/files")
def search_files(q: str, root: Path = Root):
    return search.search_files(root, q)


@router.get("/search/commits")
def search_commits(q: str, root: Path = Root):
    return search.search_commits(root, q)


@router.get("/search/refs")
def search_refs(q: str, root: Path = Root):
    return search.search_refs(root, q)


@router.get("/tags")
def get_tags(root: Path = Root):
    return tags.list_tags(root)


@router.get("/stashes")
def get_stashes(root: Path = Root):
    return stashes.list_stashes(root)


@router.get("/stashes/{index}/files")
def get_stash_files(index: int, root: Path = Root):
    try:
        return stashes.stash_files(root, index)
    except OperationError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@router.get("/insights")
def get_insights(root: Path = Root):
    return analytics.insights(root)
