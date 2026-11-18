from __future__ import annotations

from pathlib import Path

from app.services.git.runner import GitError, GitRunner
from app.services.git.validate import safe_rev, valid_ref_name
from app.services.operations.service import OperationError

runner = GitRunner()
_FMT = "\x1f".join(["%(refname:short)", "%(objecttype)", "%(objectname)", "%(*objectname)", "%(creatordate:iso-strict)",
                    "%(taggername)", "%(contents:subject)"])


def list_tags(root: Path) -> list[dict]:
    out = runner.run(["for-each-ref", f"--format={_FMT}", "--sort=-creatordate", "refs/tags"], root)
    tags = []
    for line in out.splitlines():
        name, otype, obj, peeled, date, tagger, subject = line.split("\x1f")
        commit = peeled or obj
        tags.append({"name": name, "annotated": otype == "tag", "commit": commit, "short": commit[:7], "date": date,
                     "tagger": tagger or None, "message": subject if otype == "tag" else None})
    return tags


def create_tag(root: Path, name: str, target: str | None, message: str | None) -> None:
    problem = valid_ref_name(name)
    if problem:
        raise OperationError(problem)
    try:
        runner.run(["check-ref-format", f"refs/tags/{name}"], Path.home())
    except GitError as exc:
        raise OperationError(f"'{name}' is not a valid tag name.") from exc
    if runner.run(["rev-parse", "--verify", "-q", f"refs/tags/{name}"], root, check=False).strip():
        raise OperationError(f"A tag named '{name}' already exists.")
    args = ["tag"]
    if message and message.strip():
        args += ["-a", "-m", message.strip()]
    args.append(name)
    if target:
        args.append(safe_rev(target))
    runner.run(args, root)


def delete_tag(root: Path, name: str, confirm: bool) -> None:
    safe_rev(name)
    if not runner.run(["rev-parse", "--verify", "-q", f"refs/tags/{name}"], root, check=False).strip():
        raise OperationError(f"Tag '{name}' does not exist.", 404)
    if not confirm:
        raise OperationError(f"Deleting tag '{name}' removes it from this repository only. If it was pushed, the remote keeps it. Confirmation is required.", 409)
    runner.run(["tag", "-d", name], root)
