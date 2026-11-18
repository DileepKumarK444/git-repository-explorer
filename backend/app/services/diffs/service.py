from __future__ import annotations

from pathlib import Path

from app.services.diffs.parse import join, parse_name_status, parse_numstat
from app.services.git.runner import GitError, GitRunner
from app.services.git.validate import resolve_inside, safe_rev

runner = GitRunner()
MAX_BYTES = 2 * 1024 * 1024
EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
_MISSING = ("does not exist", "exists on disk, but not in", "not in the index", "bad revision", "unknown revision",
            "invalid object name", "fatal: path")


def _spec(spec: str) -> str:
    return spec if spec in ("WORKTREE", "INDEX") else safe_rev(spec)


def _bytes(root: Path, spec: str, path: str) -> bytes | None:
    """File bytes at a revision, the index, or the working tree. None if the file is absent there."""
    spec = _spec(spec)
    if spec == "WORKTREE":
        target = resolve_inside(root, path)
        if not target.is_file():
            return None
        if target.stat().st_size > MAX_BYTES:
            raise OverflowError(target.stat().st_size)
        return target.read_bytes()
    ref = f":{path}" if spec == "INDEX" else f"{spec}:{path}"
    try:
        size = int(runner.run(["cat-file", "-s", ref], root).strip())
        if size > MAX_BYTES:
            raise OverflowError(size)
        proc = runner.run(["show", ref], root)
    except GitError as exc:
        if any(m in exc.stderr.lower() for m in _MISSING):
            return None
        raise
    return proc.encode("utf-8", "replace")


def file_pair(root: Path, path: str, base: str, target: str, old_path: str | None = None) -> dict:
    """Both sides of one file's diff, for the viewer. Missing side is an empty string (added/deleted)."""
    try:
        a = _bytes(root, base, old_path or path)
        b = _bytes(root, target, path)
    except OverflowError as exc:
        return {"path": path, "too_large": True, "binary": False, "size": exc.args[0], "original": "", "modified": ""}
    raw = (a or b"") + (b or b"")
    if b"\0" in raw[:8000] or b"\0" in (a or b"")[:8000] or b"\0" in (b or b"")[:8000]:
        return {"path": path, "binary": True, "too_large": False, "original": "", "modified": "",
                "size": len(a or b"") + len(b or b"")}
    return {"path": path, "binary": False, "too_large": False,
            "original": (a or b"").decode("utf-8", "replace"), "modified": (b or b"").decode("utf-8", "replace"),
            "added": a is None, "deleted": b is None}


def working_changes(root: Path) -> dict:
    """Staged and unstaged changes, each with line stats. Untracked files appear as unstaged 'U'."""
    st = runner.run(["status", "--porcelain=v2", "-z", "--untracked-files=all"], root).split("\0")
    staged, unstaged = [], []
    i = 0
    while i < len(st):
        e = st[i]
        i += 1
        if not e or e.startswith("#"):
            continue
        k = e[0]
        if k == "?":
            unstaged.append({"path": e[2:], "old_path": None, "status": "U", "insertions": None, "deletions": None})
            continue
        if k == "1":
            f = e.split(" ", 8); xy, path, old = f[1], f[8], None
        elif k == "2":
            f = e.split(" ", 9); xy, path, old = f[1], f[9], st[i]; i += 1
        elif k == "u":
            f = e.split(" ", 10)
            unstaged.append({"path": f[10], "old_path": None, "status": "M", "insertions": None, "deletions": None, "conflict": True})
            continue
        else:
            continue
        for side, code, dest in (("staged", xy[0], staged), ("unstaged", xy[1], unstaged)):
            if code == ".":
                continue
            dest.append({"path": path, "old_path": old if code == "R" else None,
                         "status": code if code in "MADR" else "M", "insertions": None, "deletions": None})
    has_head = runner.run(["rev-parse", "--verify", "-q", "HEAD"], root, check=False).strip() != ""
    for dest, args in ((staged, ["diff", "--cached"] + ([] if has_head else [EMPTY_TREE])), (unstaged, ["diff"])):
        stats = parse_numstat(runner.run(args + ["--numstat", "-z", "-M"], root))
        for f in dest:
            if f["status"] != "U" and f["path"] in stats:
                f["insertions"], f["deletions"] = stats[f["path"]]
    key = lambda f: f["path"].lower()
    return {"staged": sorted(staged, key=key), "unstaged": sorted(unstaged, key=key)}


def compare(root: Path, base: str, target: str, *, direct: bool = False) -> dict:
    """Compare two revisions, or a revision with the working tree (target='WORKTREE').

    Branch comparisons use the merge base (what the branch changed). `direct` compares tips as they are.
    """
    base = _spec(base)
    target = _spec(target)
    if base in ("WORKTREE", "INDEX"):
        raise ValueError("The base of a comparison must be a branch, tag or commit.")
    worktree = target == "WORKTREE"
    merge_base = None
    if not worktree and not direct:
        merge_base = runner.run(["merge-base", base, target], root, check=False).strip() or None
    diff_base = merge_base or base
    args = ["diff", diff_base] + ([] if worktree else [target])
    stats = parse_numstat(runner.run(args + ["--numstat", "-z", "-M"], root))
    files = join(parse_name_status(runner.run(args + ["--name-status", "-z", "-M"], root)), stats)
    out = {"base": base, "target": target, "diff_base": diff_base, "merge_base": merge_base, "worktree": worktree,
           "files": files, "insertions": sum(f["insertions"] or 0 for f in files),
           "deletions": sum(f["deletions"] or 0 for f in files), "ahead": 0, "behind": 0,
           "commits_ahead": [], "commits_behind": []}
    if not worktree:
        from app.services.commits.service import log
        out["ahead"] = int(runner.run(["rev-list", "--count", f"{base}..{target}"], root).strip())
        out["behind"] = int(runner.run(["rev-list", "--count", f"{target}..{base}"], root).strip())
        out["commits_ahead"] = log(root, rev=f"{base}..{target}", limit=100)["commits"] if out["ahead"] else []
        out["commits_behind"] = log(root, rev=f"{target}..{base}", limit=100)["commits"] if out["behind"] else []
    return out
