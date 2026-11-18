"""App settings, stored as one JSON document in the local SQLite file."""
from __future__ import annotations

import json
import shutil
import subprocess

from app.schemas.settings import Settings
from app.services.repositories.store import _db

_cache: Settings | None = None


def load() -> Settings:
    global _cache
    if _cache is None:
        with _db() as c:
            row = c.execute("SELECT value FROM settings WHERE key='app'").fetchone()
        try:
            _cache = Settings(**json.loads(row["value"])) if row else Settings()
        except Exception:  # corrupt or from a newer version: fall back to defaults rather than refuse to start
            _cache = Settings()
    return _cache


def save(s: Settings) -> Settings:
    global _cache
    if s.git_path:
        exe = shutil.which(s.git_path)
        if not exe:
            raise ValueError(f"'{s.git_path}' was not found. Enter the full path to the git executable, or leave it empty to use PATH.")
        try:
            out = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=10, shell=False)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ValueError(f"Could not run '{exe}': {exc}") from exc
        if out.returncode != 0 or not out.stdout.startswith("git version"):
            raise ValueError(f"'{exe}' does not look like Git (it did not report a git version).")
    with _db() as c:
        c.execute("INSERT INTO settings(key, value) VALUES('app', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  (s.model_dump_json(),))
    _cache = s
    return s


def reset_cache() -> None:
    global _cache
    _cache = None
