import pytest
from conftest import git, snapshot


def q(client, p, url, **params):
    return client.get(url, params={"repo": str(p.resolve()), **params})


@pytest.fixture
def repo(make_repo, client):
    p = make_repo(commits=2)  # f0.txt, f1.txt
    (p / "a.py").write_text("one\ntwo\nthree\n")
    git(p, "add", "-A"); git(p, "commit", "-q", "-m", "add a.py")
    client.post("/api/repositories/open", json={"path": str(p)})
    return p


def test_changes_staged_unstaged_and_both(client, repo):
    (repo / "a.py").write_text("one\nTWO\nthree\n"); git(repo, "add", "a.py")
    (repo / "a.py").write_text("one\nTWO\nthree\nfour\n")          # MM
    (repo / "new.txt").write_text("x\n"); git(repo, "add", "new.txt")  # staged add
    (repo / "f1.txt").unlink()                                      # unstaged delete
    git(repo, "mv", "f0.txt", "moved.txt")                          # staged rename
    (repo / "naïve ü.txt").write_text("u")                          # untracked
    c = q(client, repo, "/api/changes").json()
    staged = {f["path"]: f for f in c["staged"]}
    unstaged = {f["path"]: f for f in c["unstaged"]}
    assert staged["a.py"]["status"] == "M" and unstaged["a.py"]["status"] == "M"
    assert (staged["a.py"]["insertions"], staged["a.py"]["deletions"]) == (1, 1)
    assert (unstaged["a.py"]["insertions"], unstaged["a.py"]["deletions"]) == (1, 0)
    assert staged["new.txt"]["status"] == "A"
    assert staged["moved.txt"]["status"] == "R" and staged["moved.txt"]["old_path"] == "f0.txt"
    assert unstaged["f1.txt"]["status"] == "D"
    assert unstaged["naïve ü.txt"]["status"] == "U"


def test_changes_clean_and_empty_repo(client, repo, make_repo):
    assert q(client, repo, "/api/changes").json() == {"staged": [], "unstaged": []}
    e = make_repo("empty", commits=0)
    client.post("/api/repositories/open", json={"path": str(e)})
    (e / "x.txt").write_text("x\nx\n"); git(e, "add", "x.txt")
    c = q(client, e, "/api/changes").json()
    assert c["staged"][0]["status"] == "A" and c["staged"][0]["insertions"] == 2


def test_diff_unstaged_staged_untracked_deleted(client, repo):
    (repo / "a.py").write_text("one\nTWO\nthree\n"); git(repo, "add", "a.py")
    (repo / "a.py").write_text("ONE\nTWO\nthree\n")
    un = q(client, repo, "/api/diff", path="a.py", base="INDEX", target="WORKTREE").json()
    assert un["original"] == "one\nTWO\nthree\n" and un["modified"] == "ONE\nTWO\nthree\n"
    st = q(client, repo, "/api/diff", path="a.py", base="HEAD", target="INDEX").json()
    assert st["original"] == "one\ntwo\nthree\n" and st["modified"] == "one\nTWO\nthree\n"
    (repo / "u.txt").write_text("new")
    u = q(client, repo, "/api/diff", path="u.txt", base="INDEX", target="WORKTREE").json()
    assert u["original"] == "" and u["modified"] == "new" and u["added"]
    (repo / "f1.txt").unlink()
    d = q(client, repo, "/api/diff", path="f1.txt", base="INDEX", target="WORKTREE").json()
    assert d["modified"] == "" and d["original"] == "1\n" and d["deleted"]


def test_diff_rename_uses_old_path(client, repo):
    git(repo, "mv", "a.py", "b.py")
    r = q(client, repo, "/api/diff", path="b.py", old_path="a.py", base="HEAD", target="INDEX").json()
    assert r["original"] == r["modified"] == "one\ntwo\nthree\n"


def test_diff_binary_and_large(client, repo):
    (repo / "x.bin").write_bytes(b"\0\1\2" * 20)
    assert q(client, repo, "/api/diff", path="x.bin", base="INDEX", target="WORKTREE").json()["binary"]
    git(repo, "add", "x.bin")
    (repo / "x.bin").write_bytes(b"a" * (2 * 1024 * 1024 + 1))
    assert q(client, repo, "/api/diff", path="x.bin", base="INDEX", target="WORKTREE").json()["too_large"]


@pytest.mark.parametrize("params", [
    {"path": "../x", "base": "INDEX", "target": "WORKTREE"},
    {"path": ".git/config", "base": "INDEX", "target": "WORKTREE"},
    {"path": "a.py", "base": "--output=x", "target": "WORKTREE"},
    {"path": "a.py", "base": "HEAD", "target": "a b"},
])
def test_diff_refuses_bad_input(client, repo, params):
    assert q(client, repo, "/api/diff", **params).status_code == 400


@pytest.fixture
def branches(repo):
    git(repo, "checkout", "-q", "-b", "feature")
    (repo / "feat.txt").write_text("f\nf\n"); (repo / "a.py").write_text("one\ntwo\nTHREE\n")
    git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "feature work")
    git(repo, "commit", "-q", "--allow-empty", "-m", "feature empty")
    git(repo, "checkout", "-q", "main")
    (repo / "main-only.txt").write_text("m\n"); git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "main moves on")
    return repo


def test_compare_branches_merge_base(client, branches):
    c = q(client, branches, "/api/compare", base="main", target="feature").json()
    assert (c["ahead"], c["behind"]) == (2, 1)
    assert {f["path"]: f["status"] for f in c["files"]} == {"feat.txt": "A", "a.py": "M"}   # not main-only.txt
    assert c["insertions"] == 3 and c["deletions"] == 1
    assert [x["subject"] for x in c["commits_ahead"]] == ["feature empty", "feature work"]
    assert [x["subject"] for x in c["commits_behind"]] == ["main moves on"]
    assert c["merge_base"] and c["diff_base"] == c["merge_base"]


def test_compare_direct_includes_other_side(client, branches):
    c = q(client, branches, "/api/compare", base="main", target="feature", direct=True).json()
    assert "main-only.txt" in {f["path"]: f["status"] for f in c["files"]} and c["merge_base"] is None


def test_compare_same_ref_is_empty(client, branches):
    c = q(client, branches, "/api/compare", base="main", target="main").json()
    assert c["files"] == [] and c["ahead"] == c["behind"] == 0


def test_compare_with_worktree(client, branches):
    (branches / "a.py").write_text("changed\n")
    c = q(client, branches, "/api/compare", base="HEAD", target="WORKTREE").json()
    assert c["worktree"] and [f["path"] for f in c["files"]] == ["a.py"] and c["commits_ahead"] == []


def test_compare_with_tag_and_short_hash(client, branches):
    git(branches, "tag", "v1", "HEAD~1")
    h = q(client, branches, "/api/commits").json()["commits"][0]["hash"][:8]
    assert q(client, branches, "/api/compare", base="v1", target=h).status_code == 200


def test_compare_errors(client, branches):
    assert q(client, branches, "/api/compare", base="nope", target="main").status_code == 404
    assert q(client, branches, "/api/compare", base="WORKTREE", target="main").status_code == 400
    assert q(client, branches, "/api/compare", base="-x", target="main").status_code == 400


def test_diff_and_compare_are_read_only(client, branches):
    (branches / "dirty.txt").write_text("d")
    before = snapshot(branches)
    for url, p in [("/api/changes", {}), ("/api/compare", {"base": "main", "target": "feature"}),
                   ("/api/compare", {"base": "HEAD", "target": "WORKTREE"}),
                   ("/api/diff", {"path": "a.py", "base": "main", "target": "feature"})]:
        assert q(client, branches, url, **p).status_code == 200
    assert snapshot(branches) == before
