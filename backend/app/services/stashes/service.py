from __future__ import annotations

import re
from pathlib import Path

from app.services.diffs.parse import parse_name_status
from app.services.git.runner import GitError, GitRunner
from app.services.operations.service import OperationError

runner = GitRunner()


def _ref(index: int) -> str:
    if index < 0:
        raise OperationError("Invalid stash.")
    return f"stash@{{{index}}}"


def list_stashes(root: Path) -> list[dict]:
    out = runner.run(["stash", "list", "--format=%gd\x1f%H\x1f%gs\x1f%aI"], root)
    res = []
    for i, line in enumerate(l for l in out.splitlines() if l):
        _, h, subject, date = line.split("\x1f")
        m = re.match(r"(?:WIP on|On) ([^:]+): ?(.*)", subject)
        res.append({"index": i, "ref": _ref(i), "hash": h, "branch": m[1] if m else None,
                    "message": (m[2] if m else subject) or "(no message)", "date": date})
    return res


def stash_files(root: Path, index: int) -> list[dict]:
    ref = _ref(index)
    _check_exists(root, index)
    out = runner.run(["diff", "--name-status", "-z", f"{ref}^1", ref], root)
    files = [{"path": p, "old_path": o, "status": s if s in "MADR" else "M", "untracked": False} for s, o, p in parse_name_status(out)]
    rc, un, _ = runner.run_full(["ls-tree", "-r", "--name-only", "-z", f"{ref}^3"], root, check=False)  # untracked files stashed with -u
    if rc == 0:
        files += [{"path": p, "old_path": None, "status": "A", "untracked": True} for p in un.split("\0") if p]
    return files


def _check_exists(root: Path, index: int) -> None:
    if not runner.run(["rev-parse", "--verify", "-q", _ref(index)], root, check=False).strip():
        raise OperationError("That stash no longer exists.", 404)


def create(root: Path, message: str | None, include_untracked: bool) -> None:
    args = ["stash", "push"]
    if include_untracked:
        args.append("--include-untracked")
    if message and message.strip():
        args += ["-m", message.strip()]
    rc, out, err = runner.run_full(args, root, check=False)
    if rc != 0:
        raise OperationError((err or out).strip() or "Could not create a stash.")
    if "No local changes" in out:
        raise OperationError("There are no local changes to stash.")


def _apply(root: Path, index: int, verb: str) -> str:
    _check_exists(root, index)
    rc, out, err = runner.run_full(["stash", verb, _ref(index)], root, check=False)
    text = (out + "\n" + err).strip()
    if rc != 0:
        conflict = "CONFLICT" in text
        raise OperationError(
            ("The stash applied with conflicts. Resolve them in your editor. The stash was kept.\n" if conflict else "") + text, 409 if conflict else 400)
    return text.splitlines()[0] if text else "Done."


def apply(root: Path, index: int) -> str:
    return _apply(root, index, "apply")


def pop(root: Path, index: int) -> str:
    return _apply(root, index, "pop")


def drop(root: Path, index: int, confirm: bool) -> None:
    _check_exists(root, index)
    if not confirm:
        raise OperationError("Dropping a stash deletes its saved changes. They can only be recovered with git fsck. Confirmation is required.", 409)
    runner.run(["stash", "drop", _ref(index)], root)
