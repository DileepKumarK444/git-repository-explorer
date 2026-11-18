from __future__ import annotations

from pathlib import Path

from app.services.diffs.parse import join, parse_name_status, parse_numstat
from app.services.git.runner import GitError, GitRunner
from app.services.git.validate import resolve_inside, safe_rev

runner = GitRunner()
US, RS = "\x1f", "\x1e"
_FMT = US.join(["%H", "%P", "%an", "%ae", "%aI", "%D", "%s"]) + RS
MAX_PAGE = 200


def _refs(deco: str) -> list[dict]:
    refs = []
    for part in [p.strip() for p in deco.split(",") if p.strip()]:
        if part.startswith("HEAD -> "):
            refs.append({"name": "HEAD", "type": "head"})
            refs.append({"name": part[8:], "type": "branch"})
        elif part == "HEAD":
            refs.append({"name": "HEAD", "type": "head"})
        elif part.startswith("tag: "):
            refs.append({"name": part[5:], "type": "tag"})
        elif "/" in part and part.split("/")[0] in ("origin", "upstream") or part.startswith("refs/"):
            refs.append({"name": part, "type": "remote"})
        else:
            refs.append({"name": part, "type": "branch"})
    return refs


def _parse(out: str) -> list[dict]:
    commits = []
    for rec in out.split(RS):
        rec = rec.strip("\n")
        if not rec:
            continue
        h, parents, an, ae, date, deco, subject = rec.split(US)
        commits.append({"hash": h, "short": h[:7], "parents": parents.split(), "author": an, "email": ae,
                        "date": date, "refs": _refs(deco), "subject": subject})
    return commits


def log(root: Path, *, skip: int = 0, limit: int = 50, rev: str | None = None, author: str | None = None,
        text: str | None = None, since: str | None = None, until: str | None = None,
        path: str | None = None, commit: str | None = None) -> dict:
    limit = max(1, min(limit, MAX_PAGE))
    args = ["log", "--topo-order", f"--format={_FMT}"]
    if commit:
        args = ["log", "-1", f"--format={_FMT}", safe_rev(commit)]
    else:
        args += [f"--skip={max(0, skip)}", f"--max-count={limit + 1}"]  # one extra row tells us if more exist
        args += [safe_rev(rev)] if rev else ["--branches", "--remotes", "--tags", "HEAD"]  # not --all: that would include stash internals
        if author:
            args += ["--fixed-strings", f"--author={author}"]
        if text:
            args += ["--fixed-strings", "-i", f"--grep={text}"]
        if since:
            args.append(f"--since={since}")
        if until:
            args.append(f"--until={until}")
        if path:
            resolve_inside(root, path)
            args += ["--", path]
    try:
        out = runner.run(args, root)
    except GitError as exc:
        if any(m in exc.stderr for m in ("does not have any commits", "bad default revision", "ambiguous argument 'HEAD'", "unknown revision")) and not rev:
            return {"commits": [], "has_more": False}
        raise
    commits = _parse(out)
    has_more = len(commits) > limit and not commit
    return {"commits": commits[:limit], "has_more": has_more}


def detail(root: Path, rev: str) -> dict:
    rev = safe_rev(rev)
    head = log(root, commit=rev)["commits"]
    if not head:
        raise FileNotFoundError(f"Commit '{rev}' not found.")
    c = head[0]
    body = runner.run(["show", "-s", "--format=%B", rev], root).rstrip("\n")
    base = ["diff-tree", "--no-commit-id", "-r", "-z", "-M", "--root"]
    if len(c["parents"]) > 1:
        base += ["-m", "--first-parent"]
    stats = parse_numstat(runner.run(base + ["--numstat", rev], root))
    files = join(parse_name_status(runner.run(base + ["--name-status", rev], root)), stats)
    return {**c, "message": body, "files": files,
            "insertions": sum(f["insertions"] or 0 for f in files),
            "deletions": sum(f["deletions"] or 0 for f in files)}
