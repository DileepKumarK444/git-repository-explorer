from __future__ import annotations

import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.services.git.runner import GitError, GitRunner

runner = GitRunner(timeout=60.0)
SCAN = 3000  # commits scanned for file statistics, newest first


def insights(root: Path) -> dict:
    if runner.run(["rev-parse", "--verify", "-q", "HEAD"], root, check=False).strip() == "":
        return {"empty": True}
    total = int(runner.run(["rev-list", "--count", "HEAD"], root).strip())
    refs = runner.run(["for-each-ref", "--format=%(refname)"], root).splitlines()
    files = len([p for p in runner.run(["ls-files", "-z"], root).split("\0") if p])
    size = 0
    for line in runner.run(["count-objects", "-v"], root).splitlines():
        k, _, v = line.partition(": ")
        if k in ("size", "size-pack"):
            size += int(v)
    by_email: dict[str, list[tuple[int, str]]] = {}
    for line in runner.run(["shortlog", "-sne", "HEAD"], root).splitlines():
        m = re.match(r"\s*(\d+)\s+(.*?)\s+<(.*)>", line)
        if m:  # the same person may appear under several names; merge by email
            by_email.setdefault(m[3].lower(), []).append((int(m[1]), m[2]))
    contributors = {e: {"name": max(v)[1], "email": e, "commits": sum(n for n, _ in v)} for e, v in by_email.items()}
    out = runner.run(["log", f"--max-count={SCAN}", "--format=\x01%aI", "--name-only"], root)
    weeks_c: Counter[str] = Counter()
    weeks_f: Counter[str] = Counter()
    file_hits: Counter[str] = Counter()
    dir_hits: Counter[str] = Counter()
    scanned = 0
    for block in out.split("\x01")[1:]:
        head, *names = block.strip("\n").split("\n")
        dt = datetime.fromisoformat(head).astimezone(timezone.utc)
        wk = (dt - timedelta(days=dt.weekday())).strftime("%Y-%m-%d")
        weeks_c[wk] += 1
        scanned += 1
        for n in (x for x in names if x):
            weeks_f[wk] += 1
            file_hits[n] += 1
            parts = n.split("/")
            dir_hits["/".join(parts[:2]) if len(parts) > 2 else parts[0] if len(parts) > 1 else "(root)"] += 1
    # continuous weekly series, oldest to newest, last 52 weeks at most
    if weeks_c:
        first, last = min(weeks_c), max(weeks_c)
        d, series = datetime.strptime(first, "%Y-%m-%d"), []
        end = datetime.strptime(last, "%Y-%m-%d")
        while d <= end:
            k = d.strftime("%Y-%m-%d")
            series.append({"week": k, "commits": weeks_c.get(k, 0), "files": weeks_f.get(k, 0)})
            d += timedelta(days=7)
        series = series[-52:]
    else:
        series = []
    return {
        "empty": False, "commits": total, "branches": sum(1 for r in refs if r.startswith(("refs/heads/", "refs/remotes/")) and not r.endswith("/HEAD")),
        "tags": sum(1 for r in refs if r.startswith("refs/tags/")), "files": files, "size_kib": size,
        "contributors": sorted(contributors.values(), key=lambda c: -c["commits"])[:15],
        "activity": series, "top_files": [{"path": p, "changes": n} for p, n in file_hits.most_common(10)],
        "top_dirs": [{"path": p, "changes": n} for p, n in dir_hits.most_common(10)],
        "scanned": scanned, "scan_limited": total > scanned,
    }
