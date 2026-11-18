def test_health(client):
    r = client.get("/api/health").json()
    assert r["ok"] and r["git"].startswith("git version")


def test_open_invalid(client, tmp_path):
    r = client.post("/api/repositories/open", json={"path": str(tmp_path)})
    assert r.status_code == 422 and "not a Git repository" in r.json()["detail"]
    assert client.get("/api/repositories").json() == []


def test_validate_does_not_remember(client, make_repo):
    p = make_repo()
    assert client.post("/api/repositories/validate", json={"path": str(p)}).json()["valid"]
    assert client.get("/api/repositories").json() == []


def test_open_list_favourite_forget(client, make_repo):
    p = make_repo()
    assert client.post("/api/repositories/open", json={"path": str(p)}).json()["valid"]
    items = client.get("/api/repositories").json()
    assert len(items) == 1 and items[0]["name"] == "repo" and not items[0]["favourite"]
    client.post("/api/repositories/favourite", json={"path": items[0]["root"], "favourite": True})
    assert client.get("/api/repositories").json()[0]["favourite"]
    client.post("/api/repositories/forget", json={"path": items[0]["root"]})
    assert client.get("/api/repositories").json() == []
    assert p.exists()  # forgetting never deletes the folder


def test_forget_unknown_404(client):
    assert client.post("/api/repositories/forget", json={"path": "/nope"}).status_code == 404


def test_deleted_repo_reported_missing(client, make_repo):
    import shutil
    p = make_repo()
    client.post("/api/repositories/open", json={"path": str(p)})
    shutil.rmtree(p)
    item = client.get("/api/repositories").json()[0]
    assert item["missing"] and "does not exist" in item["error"]


def test_missing_git_returns_503(client, make_repo, monkeypatch):
    p = make_repo()
    monkeypatch.setenv("GRX_GIT", "no-such-git")
    r = client.post("/api/repositories/validate", json={"path": str(p)})
    assert r.status_code == 503 and "not found" in r.json()["detail"]
