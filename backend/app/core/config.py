"""Application settings. Everything is local; nothing is sent anywhere."""
from __future__ import annotations

import os
from pathlib import Path


def data_dir() -> Path:
    d = Path(os.environ.get("GRX_DATA_DIR", Path.home() / ".git-repository-explorer"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def git_executable() -> str:
    """Git path: the GRX_GIT environment variable wins, then the Settings screen, then `git` on PATH."""
    env = os.environ.get("GRX_GIT")
    if env:
        return env
    from app.services.repositories.settings import load
    return load().git_path or "git"
