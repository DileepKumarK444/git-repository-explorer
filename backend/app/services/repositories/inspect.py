"""Read-only inspection of a folder to decide if it is a Git repository."""
from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path

from app.services.git.runner import GitError, GitRunner

runner = GitRunner()


@dataclass
class RepoInfo:
    valid: bool
    path: str
    name: str = ""
    root: str = ""
    branch: str | None = None
    detached: bool = False
    has_commits: bool = False
    last_commit_hash: str | None = None
    last_commit_message: str | None = None
    last_commit_date: str | None = None
    last_commit_author: str | None = None
    modified: int = 0
    untracked: int = 0
    ahead: int | None = None
    behind: int | None = None
    upstream: str | None = None
    error: str | None = None

    def dict(self) -> dict:
        return asdict(self)


def inspect_repo(path: str) -> RepoInfo:
    p = Path(path).expanduser()
    if not p.exists():
        return RepoInfo(False, path, error=f"'{path}' does not exist.")
    if not p.is_dir():
        return RepoInfo(False, path, error=f"'{path}' is a file, not a folder.")
    p = p.resolve()
    try:
        top = runner.run(["rev-parse", "--show-toplevel"], p).strip()
    except GitError as exc:
        text = exc.stderr.lower()
        if "not a git repository" in text:
            return RepoInfo(False, str(p), error=(
                f"'{p.name}' is not a Git repository (no .git folder found). Choose the "
                "top-level folder of a repository, or run 'git init' there first."))
        if "dubious ownership" in text:
            return RepoInfo(False, str(p), error=(
                "Git refuses to open this folder because it is owned by another user. "
                f"Run: git config --global --add safe.directory {p}"))
        return RepoInfo(False, str(p), error=exc.stderr.strip() or str(exc))
    root = Path(top)
    info = RepoInfo(True, str(p), name=root.name, root=str(root))

    status = runner.run(["status", "--porcelain=v2", "--branch", "-z"], root)
    for entry in status.split("\0"):
        if entry.startswith("# branch.head "):
            head = entry[len("# branch.head "):]
            info.detached = head == "(detached)"
            info.branch = None if info.detached else head
        elif entry.startswith("# branch.upstream "):
            info.upstream = entry[len("# branch.upstream "):]
        elif entry.startswith("# branch.ab "):
            plus, minus = entry[len("# branch.ab "):].split()
            info.ahead, info.behind = int(plus[1:]), int(minus[1:])
        elif entry.startswith("? "):
            info.untracked += 1
        elif entry[:2] in ("1 ", "2 ", "u "):
            info.modified += 1

    try:
        out = runner.run(["log", "-1", "--format=%H%x1f%s%x1f%an%x1f%aI"], root).strip()
    except GitError:
        out = ""  # repository with no commits yet
    if out:
        h, msg, author, date = out.split("\x1f")
        info.has_commits = True
        info.last_commit_hash, info.last_commit_message = h, msg
        info.last_commit_author, info.last_commit_date = author, date
    return info
