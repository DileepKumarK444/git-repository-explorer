"""Validation for anything that reaches git or the filesystem from the outside."""
from __future__ import annotations

import re
from pathlib import Path

_BAD_REF = re.compile(r"[\x00-\x20\x7f~^:?*\[\\]|\.\.|@\{|//|\.lock$|/$|^/|\.$")


def valid_ref_name(name: str) -> str | None:
    """Return a human-readable problem with a branch/tag name, or None if fine."""
    if not name:
        return "Enter a name."
    if name.startswith("-"):
        return "Names cannot start with '-'."
    if name == "@" or _BAD_REF.search(name):
        return ("Names cannot contain spaces, '..', '~', '^', ':', '?', '*', '[', '\\', "
                "'@{', or end with '/', '.' or '.lock'.")
    return None


def resolve_inside(root: Path, relative: str) -> Path:
    """Resolve `relative` under `root`, refusing traversal, absolute paths and .git."""
    if relative.startswith("/") or "\x00" in relative:
        raise ValueError("Path must be relative to the repository.")
    root = root.resolve()
    target = (root / relative).resolve()
    if target != root and root not in target.parents:
        raise ValueError("Path is outside the repository.")
    if ".git" in target.relative_to(root).parts:
        raise ValueError("The .git directory is not browsable.")
    return target


_REV = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_./@^~{}\-]*$")


def safe_rev(rev: str) -> str:
    """Accept a branch, tag or commit expression; reject anything git could read as an option."""
    if not rev or len(rev) > 200 or not _REV.match(rev):
        raise ValueError(f"'{rev}' is not a valid branch, tag or commit.")
    return rev
