import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


def git(cwd, *args):
    subprocess.run(
        ["git", "-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", *args],
        cwd=cwd, check=True, capture_output=True,
    )


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    d = tmp_path / "appdata"
    monkeypatch.setenv("GRX_DATA_DIR", str(d))
    from app.services.repositories.settings import reset_cache
    reset_cache()
    yield d
    reset_cache()


@pytest.fixture
def make_repo(tmp_path):
    def _make(name="repo", commits=1):
        p = tmp_path / name
        p.mkdir()
        git(p, "init", "-q", "-b", "main")
        for i in range(commits):
            (p / f"f{i}.txt").write_text(f"{i}\n")
            git(p, "add", "-A")
            git(p, "commit", "-q", "-m", f"commit {i}")
        return p
    return _make


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app, base_url="http://127.0.0.1:8787")


def snapshot(path: Path):
    """Every file under a repo (including .git) with mtime and size."""
    return {str(f.relative_to(path)): (f.stat().st_mtime_ns, f.stat().st_size)
            for f in sorted(path.rglob("*")) if f.is_file()}
