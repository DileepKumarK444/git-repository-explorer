from __future__ import annotations

from pathlib import Path

from app.services.git.runner import GitError, GitRunner
from app.services.repositories.inspect import inspect_repo

runner = GitRunner()


def working_tree(root: Path) -> list[dict]:
    """One entry per changed path: {path, status, staged}. status in M A D R U."""
    out = runner.run(["status", "--porcelain=v2", "-z", "--untracked-files=all"], root)
    parts = out.split("\0")
    files: list[dict] = []
    i = 0
    while i < len(parts):
        e = parts[i]
        i += 1
        if not e or e.startswith("#"):
            continue
        kind = e[0]
        if kind == "?":
            files.append({"path": e[2:], "status": "U", "staged": False})
        elif kind == "1":
            f = e.split(" ", 8)
            files.append({"path": f[8], "status": _code(f[1]), "staged": f[1][0] != "."})
        elif kind == "2":
            f = e.split(" ", 9)
            files.append({"path": f[9], "status": "R", "staged": f[1][0] != ".", "old_path": parts[i]})
            i += 1
        elif kind == "u":
            f = e.split(" ", 10)
            files.append({"path": f[10], "status": "M", "staged": False, "conflict": True})
    return files


def _code(xy: str) -> str:
    c = xy[0] if xy[0] != "." else xy[1]
    return c if c in "MAD" else "M"


def overview(root: Path) -> dict:
    info = inspect_repo(str(root)).dict()
    refs = runner.run(["for-each-ref", "--format=%(refname)"], root).splitlines()
    tree = working_tree(root)
    counts = {k: sum(1 for f in tree if f["status"] == k) for k in "MADRU"}
    counts["staged"] = sum(1 for f in tree if f["staged"])
    return {
        **info,
        "branches": sum(1 for r in refs if r.startswith(("refs/heads/", "refs/remotes/")) and not r.endswith("/HEAD")),
        "tags": sum(1 for r in refs if r.startswith("refs/tags/")),
        "changes": counts,
    }
