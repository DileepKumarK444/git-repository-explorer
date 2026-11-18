"""Operations that modify a repository. Every function does one thing, validates its input first,
never stages or discards anything implicitly, and never force-pushes."""
from __future__ import annotations

from pathlib import Path

from app.services.diffs.service import working_changes
from app.services.git.runner import GitError, GitRunner
from app.services.git.validate import resolve_inside, safe_rev, valid_ref_name

runner = GitRunner()
net = GitRunner(timeout=120.0)  # fetch/pull/push can be slow; credentials never prompt (GIT_TERMINAL_PROMPT=0)
LIT = "--literal-pathspecs"  # file names are never treated as globs or pathspec magic


class OperationError(Exception):
    """A refusal with a user-facing message. `status` maps to the HTTP status."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _paths(root: Path, paths: list[str]) -> list[str]:
    if not paths:
        raise OperationError("Select at least one file.")
    clean: list[str] = []
    for p in paths:
        try:
            resolve_inside(root, p)
        except ValueError as exc:
            raise OperationError(f"'{p}': {exc}") from exc
        clean.append(p)
    return clean


def _has_head(root: Path) -> bool:
    return runner.run(["rev-parse", "--verify", "-q", "HEAD"], root, check=False).strip() != ""


def _current_branch(root: Path) -> str | None:
    return runner.run(["branch", "--show-current"], root).strip() or None


# ---- staging -------------------------------------------------------------------------------------

def stage(root: Path, paths: list[str]) -> None:
    runner.run([LIT, "add", "-A", "--", *_paths(root, paths)], root)


def unstage(root: Path, paths: list[str]) -> None:
    paths = _paths(root, paths)
    if _has_head(root):
        runner.run([LIT, "reset", "-q", "--", *paths], root)
    else:  # no commits yet: there is no HEAD to reset to
        runner.run([LIT, "rm", "--cached", "-r", "-q", "--ignore-unmatch", "--", *paths], root)


def stage_all(root: Path) -> None:
    runner.run(["add", "-A"], root)


def unstage_all(root: Path) -> None:
    if _has_head(root):
        runner.run(["reset", "-q"], root)
    else:
        runner.run(["rm", "--cached", "-r", "-q", "--ignore-unmatch", "."], root)


def discard(root: Path, paths: list[str], confirm: bool) -> dict:
    """Throw away unstaged edits. Tracked files are restored from the index; untracked files are deleted."""
    paths = _paths(root, paths)
    untracked = {f["path"] for f in working_changes(root)["unstaged"] if f["status"] == "U"}
    gone = [p for p in paths if p in untracked]
    restore = [p for p in paths if p not in untracked]
    if not confirm:
        raise OperationError(
            f"This permanently discards unstaged changes to {len(restore)} file(s)"
            + (f" and deletes {len(gone)} untracked file(s)" if gone else "")
            + ". It cannot be undone. Confirmation is required.", 409)
    if restore:
        runner.run([LIT, "restore", "--worktree", "--", *restore], root)
    if gone:
        runner.run([LIT, "clean", "-f", "-q", "--", *gone], root)
    return {"restored": restore, "deleted": gone}


# ---- commit --------------------------------------------------------------------------------------

def commit(root: Path, message: str, description: str = "") -> dict:
    subject = message.strip()
    if not subject:
        raise OperationError("Write a commit message first.")
    if "\n" in subject:
        raise OperationError("Keep the summary to one line. Put more detail in the description.")
    if not working_changes(root)["staged"]:
        raise OperationError("Nothing is staged. Stage at least one file before committing.")
    args = ["commit", "-m", subject]
    if description.strip():
        args += ["-m", description.strip()]
    runner.run(args, root)  # never -a: only what is already staged
    sha = runner.run(["rev-parse", "HEAD"], root).strip()
    return {"hash": sha, "short": sha[:7]}


# ---- branches ------------------------------------------------------------------------------------

def _check_name(name: str) -> str:
    problem = valid_ref_name(name)
    if problem:
        raise OperationError(problem)
    try:
        runner.run(["check-ref-format", f"refs/heads/{name}"], Path.home())
    except GitError as exc:
        raise OperationError(f"'{name}' is not a valid branch name.") from exc
    return name


def _exists(root: Path, ref: str) -> bool:
    return runner.run(["rev-parse", "--verify", "-q", ref], root, check=False).strip() != ""


def create_branch(root: Path, name: str, start: str | None, checkout: bool) -> None:
    _check_name(name)
    if _exists(root, f"refs/heads/{name}"):
        raise OperationError(f"A branch named '{name}' already exists.")
    args = ["branch", name]
    if start:
        args.append(safe_rev(start))
    runner.run(args, root)
    if checkout:
        runner.run(["switch", name], root)


def checkout(root: Path, name: str) -> dict:
    """Switch branches. Never stashes or discards: if local edits block the switch, git's message is returned."""
    safe_rev(name)
    if _exists(root, f"refs/heads/{name}"):
        runner.run(["switch", name], root)
        return {"branch": name, "created": False}
    remote = runner.run(["for-each-ref", "--format=%(refname)", f"refs/remotes/{name}"], root).strip()
    if remote:
        local = name.split("/", 1)[1]
        runner.run(["switch", "--track", name], root)
        return {"branch": local, "created": True}
    raise OperationError(f"Branch '{name}' does not exist.", 404)


def rename_branch(root: Path, old: str, new: str) -> None:
    safe_rev(old)
    _check_name(new)
    if not _exists(root, f"refs/heads/{old}"):
        raise OperationError(f"Local branch '{old}' does not exist.", 404)
    if _exists(root, f"refs/heads/{new}"):
        raise OperationError(f"A branch named '{new}' already exists.")
    runner.run(["branch", "-m", old, new], root)


def delete_branch(root: Path, name: str, force: bool) -> None:
    safe_rev(name)
    if not _exists(root, f"refs/heads/{name}"):
        raise OperationError(f"Local branch '{name}' does not exist. Remote branches cannot be deleted here.", 404)
    if _current_branch(root) == name:
        raise OperationError(f"'{name}' is checked out. Switch to another branch before deleting it.")
    try:
        runner.run(["branch", "-D" if force else "-d", name], root)
    except GitError as exc:
        if not force and "not fully merged" in exc.stderr:
            raise OperationError(
                f"'{name}' has commits that are not merged into your current branch. Deleting it would leave "
                "them reachable only through the reflog. Confirm to delete anyway.", 409) from exc
        raise


# ---- remotes -------------------------------------------------------------------------------------

def fetch(root: Path) -> str:
    if not runner.run(["remote"], root).strip():
        raise OperationError("This repository has no remote to fetch from.")
    net.run(["fetch", "--all"], root)
    return "Fetched all remotes."


def pull(root: Path) -> str:
    branch = _current_branch(root)
    if not branch:
        raise OperationError("HEAD is detached. Switch to a branch before pulling.")
    if runner.run(["rev-parse", "--abbrev-ref", f"{branch}@{{upstream}}"], root, check=False).strip() == "":
        raise OperationError(f"'{branch}' has no upstream branch to pull from. Push it first to set one.")
    try:
        out = net.run(["pull", "--ff-only"], root)
    except GitError as exc:
        if "not possible to fast-forward" in exc.stderr or "diverging" in exc.stderr or "fatal: Not possible" in exc.stderr:
            raise OperationError(
                "Your branch and its upstream have diverged, so a fast-forward pull is not possible. "
                "Merge or rebase in a terminal; this app does not do that automatically.", 409) from exc
        raise
    return out.strip() or "Already up to date."


def push(root: Path) -> str:
    """Plain push of the current branch. Never forces."""
    branch = _current_branch(root)
    if not branch:
        raise OperationError("HEAD is detached. Switch to a branch before pushing.")
    has_upstream = runner.run(["rev-parse", "--abbrev-ref", f"{branch}@{{upstream}}"], root, check=False).strip() != ""
    if has_upstream:
        net.run(["push"], root)
        return f"Pushed {branch}."
    remotes = runner.run(["remote"], root).split()
    if not remotes:
        raise OperationError("This repository has no remote to push to.")
    remote = "origin" if "origin" in remotes else remotes[0] if len(remotes) == 1 else None
    if remote is None:
        raise OperationError(f"'{branch}' has no upstream and there are several remotes ({', '.join(remotes)}). Push once from a terminal to choose one.")
    net.run(["push", "--set-upstream", remote, branch], root)
    return f"Pushed {branch} to {remote} and set it as the upstream."
