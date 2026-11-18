"""SQLite store for the recent/favourite repository list (app metadata only)."""
from __future__ import annotations

import sqlite3
import time
from contextlib import contextmanager

from app.core.config import data_dir



@contextmanager
def _db():
    conn = sqlite3.connect(data_dir() / "app.db")
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS repos (
        path TEXT PRIMARY KEY, favourite INTEGER NOT NULL DEFAULT 0, opened_at REAL NOT NULL)""")
    conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def list_paths() -> list[dict]:
    with _db() as c:
        rows = c.execute("SELECT path, favourite, opened_at FROM repos ORDER BY opened_at DESC").fetchall()
    return [{"path": r["path"], "favourite": bool(r["favourite"]), "opened_at": r["opened_at"]} for r in rows]


def touch(path: str) -> None:
    with _db() as c:
        c.execute("""INSERT INTO repos(path, opened_at) VALUES(?, ?)
                     ON CONFLICT(path) DO UPDATE SET opened_at=excluded.opened_at""", (path, time.time()))
        from app.services.repositories.settings import load
        limit = load().history_limit
        # keep favourites; trim only non-favourites beyond the history limit
        c.execute("""DELETE FROM repos WHERE favourite=0 AND path NOT IN (
                     SELECT path FROM repos WHERE favourite=0 ORDER BY opened_at DESC LIMIT ?)""", (limit,))


def set_favourite(path: str, value: bool) -> bool:
    with _db() as c:
        return c.execute("UPDATE repos SET favourite=? WHERE path=?", (int(value), path)).rowcount > 0


def remove(path: str) -> bool:
    """Forget a repository. Only touches the app's own list, never the folder."""
    with _db() as c:
        return c.execute("DELETE FROM repos WHERE path=?", (path,)).rowcount > 0
