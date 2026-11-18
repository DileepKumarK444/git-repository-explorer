import shutil

import pytest
from conftest import git


def test_defaults(client):
    s = client.get("/api/settings").json()
    assert s["theme"] == "dark" and s["confirm_destructive"] is True and s["history_limit"] == 50
    assert "node_modules" in s["exclude_dirs"]


def test_partial_update_persists_across_cache_reset(client):
    from app.services.repositories.settings import reset_cache
    assert client.put("/api/settings", json={"theme": "light", "diff_context": 7}).json()["theme"] == "light"
    reset_cache()  # simulate a restart: must come back from SQLite
    s = client.get("/api/settings").json()
    assert s["theme"] == "light" and s["diff_context"] == 7 and s["history_limit"] == 50


@pytest.mark.parametrize("body", [{"theme": "neon"}, {"diff_context": 99}, {"history_limit": 1}, {"exclude_dirs": ["../x"]},
                                  {"exclude_dirs": ["-rf"]}, {"default_diff": "tabs"}])
def test_invalid_values_rejected(client, body):
    r = client.put("/api/settings", json=body)
    assert r.status_code == 400 and r.json()["detail"]
    assert client.get("/api/settings").json()["theme"] == "dark"   # nothing half-saved


def test_git_path_validated_and_used(client, make_repo):
    r = client.put("/api/settings", json={"git_path": "/definitely/not/git"})
    assert r.status_code == 400 and "was not found" in r.json()["detail"]
    sh = shutil.which("sh")
    r = client.put("/api/settings", json={"git_path": sh})
    assert r.status_code == 400 and "does not look like Git" in r.json()["detail"]
    good = shutil.which("git")
    assert client.put("/api/settings", json={"git_path": good}).status_code == 200
    p = make_repo()
    assert client.post("/api/repositories/validate", json={"path": str(p)}).json()["valid"]


def test_unusable_saved_git_path_is_reported_not_crashing(client, make_repo, monkeypatch):
    from app.services.repositories import settings as svc
    svc.save(svc.load().model_copy(update={"git_path": shutil.which("git")}))
    svc._cache = svc.load().model_copy(update={"git_path": "/gone/git"})     # git moved after saving
    p = make_repo()
    r = client.post("/api/repositories/validate", json={"path": str(p)})
    assert r.status_code == 503 and "not found" in r.json()["detail"]
    assert client.get("/api/health").json()["ok"] is False                   # UI can show a banner


def test_env_override_wins(client, make_repo, monkeypatch):
    monkeypatch.setenv("GRX_GIT", "no-such-git")
    assert client.get("/api/health").json()["ok"] is False


def test_history_limit_trims_recent_but_keeps_favourites(client, make_repo):
    client.put("/api/settings", json={"history_limit": 5})
    paths = []
    for i in range(8):
        p = make_repo(f"r{i}")
        client.post("/api/repositories/open", json={"path": str(p)}); paths.append(p)
        if i == 0:
            client.post("/api/repositories/favourite", json={"path": str(p.resolve()), "favourite": True})
    items = client.get("/api/repositories").json()
    assert sum(1 for r in items if not r["favourite"]) == 5 and any(r["favourite"] for r in items)
    assert all(p.exists() for p in paths)
