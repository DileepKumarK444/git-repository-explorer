"""Parsers for `git diff --numstat -z` and `--name-status -z` output."""
from __future__ import annotations


def parse_numstat(out: str) -> dict[str, tuple[int | None, int | None]]:
    stats: dict[str, tuple[int | None, int | None]] = {}
    parts = out.split("\0")
    i = 0
    while i < len(parts):
        rec = parts[i]
        i += 1
        if not rec:
            continue
        a, d, p = rec.split("\t", 2)
        if p == "":  # rename: old and new paths follow as separate records
            p = parts[i + 1]
            i += 2
        stats[p] = (None if a == "-" else int(a), None if d == "-" else int(d))
    return stats


def parse_name_status(out: str) -> list[tuple[str, str | None, str]]:
    """Returns (status letter, old_path or None, path)."""
    parts = out.split("\0")
    res, i = [], 0
    while i < len(parts):
        st = parts[i]
        i += 1
        if not st:
            continue
        if st[0] in "RC":
            res.append((st[0], parts[i], parts[i + 1]))
            i += 2
        else:
            res.append((st[0], None, parts[i]))
            i += 1
    return res


def join(name_status: list[tuple[str, str | None, str]], stats: dict) -> list[dict]:
    files = []
    for st, old, p in name_status:
        ins, dele = stats.get(p, (None, None))
        files.append({"path": p, "old_path": old, "status": st if st in "MADR" else "M",
                      "insertions": ins, "deletions": dele})
    return files
