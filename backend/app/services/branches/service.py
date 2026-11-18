from __future__ import annotations

import re
from pathlib import Path

from app.services.git.runner import GitRunner

runner = GitRunner()
SEP = "\x1f"
_FMT = SEP.join(["%(refname)", "%(HEAD)", "%(objectname)", "%(upstream:short)", "%(upstream:track)",
                 "%(authorname)", "%(committerdate:iso-strict)", "%(contents:subject)"])


def list_branches(root: Path) -> list[dict]:
    out = runner.run(["for-each-ref", f"--format={_FMT}", "refs/heads", "refs/remotes"], root)
    rows = []
    for line in out.splitlines():
        ref, head, sha, upstream, track, author, date, subject = line.split(SEP)
        if ref.endswith("/HEAD"):
            continue
        remote = ref.startswith("refs/remotes/")
        name = ref[len("refs/remotes/"):] if remote else ref[len("refs/heads/"):]
        ahead = behind = 0
        gone = "gone" in track
        if m := re.search(r"ahead (\d+)", track):
            ahead = int(m[1])
        if m := re.search(r"behind (\d+)", track):
            behind = int(m[1])
        rows.append({"name": name, "remote": remote, "current": head == "*", "hash": sha[:7],
                     "full_hash": sha, "upstream": upstream or None, "upstream_gone": gone,
                     "ahead": ahead, "behind": behind, "author": author, "date": date, "subject": subject})
    rows.sort(key=lambda r: (r["remote"], not r["current"], r["name"]))
    return rows
