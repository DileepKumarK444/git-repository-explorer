from __future__ import annotations

from pathlib import Path

from app.services.git.runner import GitError, GitRunner
from app.services.git.validate import resolve_inside, safe_rev
from app.services.repositories.overview import working_tree

runner = GitRunner()
MAX_BYTES = 2 * 1024 * 1024
HIDDEN_ALWAYS = {".git"}


def list_files(root: Path, ref: str | None = None) -> list[dict]:
    """Flat list of files with git status. The UI builds the tree. Never walks the disk."""
    if ref:
        out = runner.run(["ls-tree", "-r", "-z", "--name-only", safe_rev(ref)], root)
        return [{"path": p, "status": ""} for p in out.split("\0") if p]
    out = runner.run(["ls-files", "-z", "--cached", "--others", "--exclude-standard"], root)
    status = {f["path"]: f["status"] for f in working_tree(root)}
    paths = sorted({p for p in out.split("\0") if p})
    deleted = [p for p, s in status.items() if s == "D" and p not in paths]
    return [{"path": p, "status": status.get(p, "")} for p in sorted(paths + deleted)]


def read_file(root: Path, path: str, ref: str | None = None) -> dict:
    name = Path(path).name
    if ref:
        rev = safe_rev(ref)
        size = int(runner.run(["cat-file", "-s", f"{rev}:{path}"], root).strip())
        if size > MAX_BYTES:
            return {"path": path, "size": size, "binary": False, "too_large": True, "content": ""}
        text = runner.run(["show", f"{rev}:{path}"], root)
        raw = text.encode("utf-8", "replace")
    else:
        target = resolve_inside(root, path)
        if not target.is_file():
            raise FileNotFoundError(f"'{path}' is not a file in the working tree.")
        size = target.stat().st_size
        if size > MAX_BYTES:
            return {"path": path, "size": size, "binary": False, "too_large": True, "content": ""}
        raw = target.read_bytes()
    binary = b"\0" in raw[:8000]
    return {"path": path, "name": name, "size": size, "binary": binary, "too_large": False,
            "content": "" if binary else raw.decode("utf-8", "replace")}


def blame(root: Path, path: str, ref: str | None = None) -> dict:
    resolve_inside(root, path)
    args = ["blame", "--porcelain", "-w"]
    if ref:
        args.append(safe_rev(ref))
    args += ["--", path]
    out = runner.run(args, root)
    commits: dict[str, dict] = {}
    lines: list[str] = []
    cur: str | None = None
    for ln in out.split("\n"):
        if ln.startswith("\t"):
            continue
        head = ln.split(" ")
        if len(head[0]) == 40 and all(c in "0123456789abcdef" for c in head[0]) and len(head) >= 3:
            cur = head[0]
            lines.append(cur)
            commits.setdefault(cur, {"hash": cur})
        elif cur and " " in ln:
            k, v = ln.split(" ", 1)
            c = commits[cur]
            if k == "author":
                c["author"] = v
            elif k == "author-time":
                c["time"] = int(v)
            elif k == "summary":
                c["summary"] = v
    for h, c in commits.items():
        c["uncommitted"] = set(h) == {"0"}
    return {"commits": commits, "lines": lines}
