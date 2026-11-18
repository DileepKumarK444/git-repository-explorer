import pytest
from conftest import git, snapshot


@pytest.fixture
def rich(make_repo, tmp_path, client):
    """main with a merged feature branch, a tag, a remote, and a dirty working tree."""
    p = make_repo(commits=2)
    (p / "src").mkdir()
    (p / "src" / "app.py").write_text("line1\nline2\nline3\n")
    (p / "naïve file ü.txt").write_text("héllo\n")
    git(p, "add", "-A"); git(p, "commit", "-q", "-m", "add app")
    git(p, "tag", "v1.0")
    git(p, "checkout", "-q", "-b", "feature/x")
    (p / "src" / "app.py").write_text("line1\nLINE2\nline3\nnew\n")
    git(p, "commit", "-qam", "change app")
    git(p, "checkout", "-q", "main")
    git(p, "merge", "--no-ff", "-q", "-m", "Merge feature/x", "feature/x")
    git(p, "mv", "f0.txt", "renamed.txt"); git(p, "commit", "-qm", "rename f0")
    origin = tmp_path / "o.git"
    git(tmp_path, "init", "-q", "--bare", "-b", "main", str(origin))
    git(p, "remote", "add", "origin", str(origin)); git(p, "push", "-q", "-u", "origin", "main")
    (p / "src" / "app.py").write_text("dirty\n")
    (p / "untracked.txt").write_text("u")
    client.post("/api/repositories/open", json={"path": str(p)})
    return p


def q(client, p, url, **params):
    return client.get(url, params={"repo": str(p.resolve()), **params})


def test_unopened_repo_refused(client, make_repo):
    p = make_repo()
    r = client.get("/api/overview", params={"repo": str(p)})
    assert r.status_code == 404 and "not been opened" in r.json()["detail"]


def test_overview(client, rich):
    o = q(client, rich, "/api/overview").json()
    assert o["branch"] == "main" and o["tags"] == 1 and o["branches"] == 3
    assert o["changes"]["M"] == 1 and o["changes"]["U"] == 1
    assert o["recent"][0]["subject"] == "rename f0"


def test_overview_empty_repo(client, make_repo):
    p = make_repo(commits=0)
    client.post("/api/repositories/open", json={"path": str(p)})
    o = q(client, p, "/api/overview").json()
    assert o["recent"] == [] and not o["has_commits"]
    assert q(client, p, "/api/commits").json() == {"commits": [], "has_more": False}


def test_files_list_includes_status_and_unicode(client, rich):
    files = {f["path"]: f["status"] for f in q(client, rich, "/api/files").json()}
    assert files["src/app.py"] == "M" and files["untracked.txt"] == "U"
    assert "naïve file ü.txt" in files and "renamed.txt" in files
    assert not any(".git/" in p for p in files)


def test_files_at_ref(client, rich):
    files = [f["path"] for f in q(client, rich, "/api/files", ref="v1.0").json()]
    assert "f0.txt" in files and "renamed.txt" not in files


def test_file_content_working_tree_and_ref(client, rich):
    assert q(client, rich, "/api/files/content", path="src/app.py").json()["content"] == "dirty\n"
    old = q(client, rich, "/api/files/content", path="src/app.py", ref="v1.0").json()
    assert old["content"].startswith("line1") and not old["binary"]


def test_binary_file(client, rich):
    (rich / "blob.bin").write_bytes(b"\x00\x01\x02" * 10)
    r = q(client, rich, "/api/files/content", path="blob.bin").json()
    assert r["binary"] and r["content"] == ""


def test_large_file_not_loaded(client, rich):
    (rich / "big.txt").write_text("x" * (2 * 1024 * 1024 + 1))
    r = q(client, rich, "/api/files/content", path="big.txt").json()
    assert r["too_large"] and r["content"] == ""


@pytest.mark.parametrize("bad", ["../secret", "/etc/passwd", ".git/config", "src/../../x"])
def test_file_traversal_refused(client, rich, bad):
    assert q(client, rich, "/api/files/content", path=bad).status_code == 400
    assert q(client, rich, "/api/files/blame", path=bad).status_code == 400


def test_symlink_escape_refused(client, rich, tmp_path):
    secret = tmp_path / "secret.txt"; secret.write_text("top secret")
    (rich / "link.txt").symlink_to(secret)
    assert q(client, rich, "/api/files/content", path="link.txt").status_code == 400


def test_blame(client, rich):
    b = q(client, rich, "/api/files/blame", path="src/app.py", ref="HEAD").json()
    assert len(b["lines"]) == 4
    assert {c["summary"] for c in b["commits"].values()} == {"add app", "change app"}


def test_blame_untracked_is_404(client, rich):
    assert q(client, rich, "/api/files/blame", path="untracked.txt").status_code == 404


def test_branches(client, rich):
    bs = q(client, rich, "/api/branches").json()
    names = [(b["name"], b["remote"]) for b in bs]
    assert names[0] == ("main", False) and ("feature/x", False) in names and ("origin/main", True) in names
    assert bs[0]["current"] and bs[0]["upstream"] == "origin/main"
    git(rich, "commit", "-q", "--allow-empty", "-m", "ahead")
    assert q(client, rich, "/api/branches").json()[0]["ahead"] == 1


def test_commit_list_refs_and_merge(client, rich):
    r = q(client, rich, "/api/commits").json()
    cs = r["commits"]
    head = cs[0]
    assert {"name": "HEAD", "type": "head"} in head["refs"] and {"name": "main", "type": "branch"} in head["refs"]
    merge = next(c for c in cs if c["subject"] == "Merge feature/x")
    assert len(merge["parents"]) == 2
    assert any(rf == {"name": "v1.0", "type": "tag"} for c in cs for rf in c["refs"])


def test_pagination(client, rich):
    p1 = q(client, rich, "/api/commits", limit=3).json()
    assert len(p1["commits"]) == 3 and p1["has_more"]
    p2 = q(client, rich, "/api/commits", limit=3, skip=3).json()
    assert not set(c["hash"] for c in p1["commits"]) & set(c["hash"] for c in p2["commits"])


def test_commit_filters(client, rich):
    assert [c["subject"] for c in q(client, rich, "/api/commits", q="CHANGE app").json()["commits"]] == ["change app"]
    assert q(client, rich, "/api/commits", author="nobody").json()["commits"] == []
    assert q(client, rich, "/api/commits", author="T").json()["commits"]
    by_path = q(client, rich, "/api/commits", path="src/app.py").json()["commits"]
    assert {c["subject"] for c in by_path} >= {"add app", "change app"} and len(by_path) < 6
    h = q(client, rich, "/api/commits").json()["commits"][1]["hash"]
    assert q(client, rich, "/api/commits", hash=h[:8]).json()["commits"][0]["hash"] == h
    assert q(client, rich, "/api/commits", hash="deadbeef").json()["commits"] == []


def test_commit_search_is_literal(client, rich):
    assert q(client, rich, "/api/commits", q=".*").json()["commits"] == []


def test_commit_detail(client, rich):
    c = q(client, rich, "/api/commits", q="rename f0").json()["commits"][0]
    d = q(client, rich, f"/api/commits/{c['hash']}").json()
    assert d["files"][0]["status"] == "R" and d["files"][0]["old_path"] == "f0.txt"
    root = q(client, rich, "/api/commits").json()["commits"][-1]["hash"]
    d0 = q(client, rich, f"/api/commits/{root}").json()
    assert d0["parents"] == [] and d0["files"][0]["status"] == "A" and d0["insertions"] == 1


def test_merge_commit_detail_uses_first_parent(client, rich):
    c = q(client, rich, "/api/commits", q="Merge feature/x").json()["commits"][0]
    d = q(client, rich, f"/api/commits/{c['hash']}").json()
    assert [f["path"] for f in d["files"]] == ["src/app.py"]


def test_bad_revisions_refused(client, rich):
    for bad in ["--output=/tmp/x", "-p", "a b", ""]:
        assert q(client, rich, "/api/commits", rev=bad).status_code in (400, 422) or bad == ""
    assert q(client, rich, "/api/commits/--help").status_code == 400
    assert q(client, rich, "/api/commits/nope").status_code == 404


def test_unicode_filename_commit(client, rich):
    c = q(client, rich, "/api/commits", q="add app").json()["commits"][0]
    names = [f["path"] for f in q(client, rich, f"/api/commits/{c['hash']}").json()["files"]]
    assert "naïve file ü.txt" in names


def test_all_read_endpoints_leave_repo_untouched(client, rich):
    before = snapshot(rich)
    for url, params in [("/api/overview", {}), ("/api/files", {}), ("/api/files/content", {"path": "src/app.py"}),
                        ("/api/files/blame", {"path": "src/app.py", "ref": "HEAD"}), ("/api/branches", {}),
                        ("/api/commits", {}), ("/api/commits", {"q": "app"})]:
        assert q(client, rich, url, **params).status_code == 200
    assert snapshot(rich) == before
