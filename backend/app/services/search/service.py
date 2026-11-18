from __future__ import annotations

import re
from pathlib import Path

from app.services.commits.service import log
from app.services.git.runner import GitError, GitRunner

runner = GitRunner()
DEFAULT_EXCLUDES = [".git", "node_modules", ".venv", "venv", "dist", "build", "coverage"]
MAX_RESULTS = 500
_HEX = re.compile(r"^[0-9a-fA-F]{4,40}$")


def _clean_names(items: list[str]) -> list[str]:
    out = []
    for i in items:
        i = i.strip().strip("/")
        if not i:
            continue
        if ".." in i.split("/") or "\0" in i or i.startswith(("-", ":")):
            raise ValueError(f"'{i}' is not a valid folder name to exclude.")
        out.append(i)
    return out


def search_content(root: Path, query: str, *, case: bool = False, word: bool = False, regex: bool = False,
                   types: list[str] | None = None, exclude: list[str] | None = None, context: int = 0) -> dict:
    if not query:
        return {"files": [], "total": 0, "truncated": False}
    exclude = DEFAULT_EXCLUDES if exclude is None else _clean_names(exclude)
    types = [t.lstrip(".*") for t in (types or []) if t.strip()]
    if any(not re.fullmatch(r"[\w+\-]+", t) for t in types):
        raise ValueError("File types must be plain extensions such as py or ts.")
    args = ["grep", "-n", "-I", "--heading", "--break", "--untracked", "--exclude-standard",
            f"-C{max(0, min(context, 5))}"]
    if not case:
        args.append("-i")
    if word:
        args.append("-w")
    tail = ["-e", query, "--"]
    tail += [f":(glob){'**/*.' + t}" for t in types] or ["."]
    for d in exclude:
        tail += [f":(exclude,glob)**/{d}/**", f":(exclude,glob){d}/**"]
    # Regex mode prefers PCRE (\s, \d, lookahead), which most Git builds have; fall back to POSIX extended.
    engines = ["-P", "-E"] if regex else ["-F"]
    for engine in engines:
        rc, out, err = runner.run_full(args + [engine] + tail, root, check=False)
        if rc > 1 and engine == "-P" and "-P" in err:
            continue
        break
    if rc == 1 and not out:
        return {"files": [], "total": 0, "truncated": False}
    if rc not in (0, 1):
        raise ValueError(err.strip().replace("fatal: ", "") or "Search failed.")
    try:
        flags = 0 if case else re.IGNORECASE
        pat = re.compile((rf"\b(?:{query})\b" if word else query) if regex else (rf"\b{re.escape(query)}\b" if word else re.escape(query)), flags)
    except re.error:
        pat = None
    files: dict[str, list[dict]] = {}
    total = 0
    truncated = False
    path = ""
    expect_path = True
    for line in out.split("\n"):
        if expect_path:  # --heading --break: a path line starts each file, a blank line ends it
            if line:
                path, expect_path = line, False
            continue
        if line == "":
            expect_path = True
            continue
        if line == "--":
            continue
        m = re.match(r"(\d+)([:-])(.*)", line, re.S)
        if not m:
            continue
        no, kind, text = int(m[1]), m[2], m[3]
        is_match = kind == ":"
        if is_match:
            if total >= MAX_RESULTS:
                truncated = True
                continue
            total += 1
        ranges = [[x.start(), x.end()] for x in pat.finditer(text) if x.end() > x.start()][:20] if (pat and is_match) else []
        files.setdefault(path, []).append({"line": no, "text": text[:400], "match": is_match, "ranges": ranges})
    return {"files": [{"path": p, "lines": ls} for p, ls in files.items()], "total": total, "truncated": truncated}


def search_files(root: Path, query: str, limit: int = 100) -> list[str]:
    q = query.lower().strip()
    if not q:
        return []
    out = runner.run(["ls-files", "-z", "--cached", "--others", "--exclude-standard"], root)
    paths = [p for p in out.split("\0") if p]
    def score(p: str):
        name = p.rsplit("/", 1)[-1].lower()
        return (0 if name == q else 1 if name.startswith(q) else 2 if q in name else 3, len(p))
    hits = [p for p in paths if q in p.lower()]
    return sorted(hits, key=score)[:limit]


def search_commits(root: Path, query: str, limit: int = 50) -> list[dict]:
    q = query.strip()
    if not q:
        return []
    found: dict[str, dict] = {}
    if _HEX.match(q):  # a hash or hash prefix
        try:
            for c in log(root, commit=q)["commits"]:
                found[c["hash"]] = c
        except (GitError, ValueError):
            pass
    for c in log(root, text=q, limit=limit)["commits"]:
        found.setdefault(c["hash"], c)
    return list(found.values())[:limit]


def search_refs(root: Path, query: str) -> list[dict]:
    q = query.lower().strip()
    if not q:
        return []
    out = runner.run(["for-each-ref", "--format=%(refname)%1f%(objectname:short)", "refs/heads", "refs/remotes", "refs/tags"], root)
    res = []
    for line in out.splitlines():
        ref, sha = line.split("\x1f")
        if ref.endswith("/HEAD"):
            continue
        kind = "tag" if ref.startswith("refs/tags/") else "remote" if ref.startswith("refs/remotes/") else "branch"
        name = ref.split("/", 2)[2]
        if q in name.lower():
            res.append({"name": name, "kind": kind, "hash": sha})
    return res[:100]
