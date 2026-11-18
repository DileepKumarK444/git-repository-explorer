import subprocess

import pytest
from conftest import git, snapshot


def out(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def post(client, p, url, body=None):
    return client.post(f"/api/ops/{url}", params={"repo": str(p.resolve())}, json=body)


def changes(client, p):
    return client.get("/api/changes", params={"repo": str(p.resolve())}).json()


@pytest.fixture
def repo(make_repo, client):
    p = make_repo(commits=2)
    client.post("/api/repositories/open", json={"path": str(p)})
    return p


# ---- staging --------------------------------------------------------------------------------------

def test_stage_and_unstage_single_file_only(client, repo):
    (repo / "a.txt").write_text("a"); (repo / "b.txt").write_text("b")
    assert post(client, repo, "stage", {"paths": ["a.txt"]}).status_code == 200
    c = changes(client, repo)
    assert [f["path"] for f in c["staged"]] == ["a.txt"] and [f["path"] for f in c["unstaged"]] == ["b.txt"]
    post(client, repo, "unstage", {"paths": ["a.txt"]})
    assert changes(client, repo)["staged"] == []
    assert (repo / "a.txt").read_text() == "a"  # working tree untouched


def test_stage_all_and_unstage_all(client, repo):
    (repo / "a.txt").write_text("a"); (repo / "f0.txt").write_text("changed"); (repo / "f1.txt").unlink()
    post(client, repo, "stage-all")
    assert len(changes(client, repo)["staged"]) == 3 and changes(client, repo)["unstaged"] == []
    post(client, repo, "unstage-all")
    assert changes(client, repo)["staged"] == [] and len(changes(client, repo)["unstaged"]) == 3


def test_stage_rename_both_paths(client, repo):
    git(repo, "mv", "f0.txt", "moved.txt"); post(client, repo, "unstage", {"paths": ["f0.txt", "moved.txt"]})
    assert changes(client, repo)["staged"] == []
    post(client, repo, "stage", {"paths": ["f0.txt", "moved.txt"]})
    s = changes(client, repo)["staged"]
    assert s[0]["status"] == "R" and s[0]["old_path"] == "f0.txt"


def test_stage_hunks_of_special_names_are_literal(client, repo):
    (repo / "[a].txt").write_text("1"); (repo / "a.txt").write_text("2"); (repo / "x y ü.txt").write_text("3")
    post(client, repo, "stage", {"paths": ["[a].txt", "x y ü.txt"]})
    assert {f["path"] for f in changes(client, repo)["staged"]} == {"[a].txt", "x y ü.txt"}   # a.txt not swept in
    (repo / "g1.txt").write_text("g"); (repo / "g2.txt").write_text("g")
    post(client, repo, "stage", {"paths": ["*.txt"]})        # a glob matches nothing literal
    assert "g1.txt" not in {f["path"] for f in changes(client, repo)["staged"]}


def test_unstage_in_repo_without_commits(client, make_repo):
    p = make_repo(commits=0)
    client.post("/api/repositories/open", json={"path": str(p)})
    (p / "x.txt").write_text("x"); post(client, p, "stage", {"paths": ["x.txt"]})
    assert changes(client, p)["staged"][0]["status"] == "A"
    assert post(client, p, "unstage", {"paths": ["x.txt"]}).status_code == 200
    c = changes(client, p)
    assert c["staged"] == [] and c["unstaged"][0]["status"] == "U" and (p / "x.txt").exists()
    post(client, p, "stage-all"); post(client, p, "unstage-all")
    assert changes(client, p)["staged"] == []


@pytest.mark.parametrize("bad", ["../x", "/etc/passwd", ".git/config"])
def test_stage_refuses_unsafe_paths(client, repo, bad):
    assert post(client, repo, "stage", {"paths": [bad]}).status_code == 400
    assert post(client, repo, "discard", {"paths": [bad], "confirm": True}).status_code == 400


def test_empty_selection_refused(client, repo):
    assert post(client, repo, "stage", {"paths": []}).status_code == 400


def test_unopened_repo_cannot_be_modified(client, make_repo):
    p = make_repo("other")
    assert post(client, p, "stage-all").status_code == 404


# ---- discard --------------------------------------------------------------------------------------

def test_discard_requires_confirmation(client, repo):
    (repo / "f0.txt").write_text("edited")
    r = post(client, repo, "discard", {"paths": ["f0.txt"]})
    assert r.status_code == 409 and "cannot be undone" in r.json()["detail"]
    assert (repo / "f0.txt").read_text() == "edited"


def test_discard_restores_tracked_and_deletes_untracked_only_selected(client, repo):
    (repo / "f0.txt").write_text("edited"); (repo / "f1.txt").write_text("also edited")
    (repo / "junk.txt").write_text("j"); (repo / "keep.txt").write_text("k")
    r = post(client, repo, "discard", {"paths": ["f0.txt", "junk.txt"], "confirm": True}).json()
    assert r == {"restored": ["f0.txt"], "deleted": ["junk.txt"]}
    assert (repo / "f0.txt").read_text() == "0\n" and not (repo / "junk.txt").exists()
    assert (repo / "f1.txt").read_text() == "also edited" and (repo / "keep.txt").exists()


def test_discard_keeps_staged_version(client, repo):
    (repo / "f0.txt").write_text("staged"); git(repo, "add", "f0.txt"); (repo / "f0.txt").write_text("worktree")
    post(client, repo, "discard", {"paths": ["f0.txt"], "confirm": True})
    assert (repo / "f0.txt").read_text() == "staged" and changes(client, repo)["staged"][0]["path"] == "f0.txt"


# ---- commit ---------------------------------------------------------------------------------------

def test_commit_only_what_is_staged(client, repo):
    (repo / "a.txt").write_text("a"); (repo / "f0.txt").write_text("edited")
    post(client, repo, "stage", {"paths": ["a.txt"]})
    r = post(client, repo, "commit", {"message": " Add a ", "description": "Because."})
    assert r.status_code == 200 and r.json()["hash"] == out(repo, "rev-parse", "HEAD")
    assert out(repo, "log", "-1", "--format=%s") == "Add a" and out(repo, "log", "-1", "--format=%b") == "Because."
    assert out(repo, "show", "--name-only", "--format=", "HEAD") == "a.txt"
    assert [f["path"] for f in changes(client, repo)["unstaged"]] == ["f0.txt"]      # not auto-staged


@pytest.mark.parametrize("msg,why", [("", "Write a commit message"), ("   ", "Write a commit message"), ("a\nb", "one line")])
def test_commit_message_validation(client, repo, msg, why):
    (repo / "a.txt").write_text("a"); post(client, repo, "stage", {"paths": ["a.txt"]})
    r = post(client, repo, "commit", {"message": msg})
    assert r.status_code == 400 and why in r.json()["detail"]


def test_commit_with_nothing_staged(client, repo):
    (repo / "a.txt").write_text("a")
    before = out(repo, "rev-parse", "HEAD")
    r = post(client, repo, "commit", {"message": "x"})
    assert r.status_code == 400 and "Nothing is staged" in r.json()["detail"] and out(repo, "rev-parse", "HEAD") == before


def test_first_commit_in_empty_repo_and_dash_message(client, make_repo):
    p = make_repo(commits=0)
    client.post("/api/repositories/open", json={"path": str(p)})
    (p / "x.txt").write_text("x"); post(client, p, "stage-all")
    assert post(client, p, "commit", {"message": "--amend -a"}).status_code == 200
    assert out(p, "log", "-1", "--format=%s") == "--amend -a" and out(p, "rev-list", "--count", "HEAD") == "1"


# ---- branches -------------------------------------------------------------------------------------

def test_create_branch_variants(client, repo):
    assert post(client, repo, "branches/create", {"name": "feature/x"}).status_code == 200
    assert out(repo, "branch", "--show-current") == "main"                       # not checked out
    assert post(client, repo, "branches/create", {"name": "y", "start": "HEAD~1", "checkout": True}).status_code == 200
    assert out(repo, "branch", "--show-current") == "y" and out(repo, "rev-parse", "HEAD") == out(repo, "rev-parse", "main~1")


@pytest.mark.parametrize("name", ["", "a b", "a..b", "-x", "x.lock", "a~1", "feature/", "a:b"])
def test_create_branch_rejects_bad_names(client, repo, name):
    r = post(client, repo, "branches/create", {"name": name})
    assert r.status_code == 400 and r.json()["detail"]


def test_create_duplicate_and_bad_start(client, repo):
    assert "already exists" in post(client, repo, "branches/create", {"name": "main"}).json()["detail"]
    assert post(client, repo, "branches/create", {"name": "z", "start": "--bad"}).status_code == 400
    assert post(client, repo, "branches/create", {"name": "z", "start": "nope"}).status_code == 400
    assert "z" not in out(repo, "branch")


def test_checkout_and_blocked_by_local_changes(client, repo):
    git(repo, "branch", "other")
    assert post(client, repo, "branches/checkout", {"name": "other"}).json() == {"branch": "other", "created": False}
    (repo / "f0.txt").write_text("other side"); git(repo, "commit", "-qam", "diverge")
    git(repo, "switch", "-q", "main"); (repo / "f0.txt").write_text("uncommitted")
    r = post(client, repo, "branches/checkout", {"name": "other"})
    assert r.status_code == 400 and out(repo, "branch", "--show-current") == "main"
    assert (repo / "f0.txt").read_text() == "uncommitted"                        # nothing stashed or lost
    assert post(client, repo, "branches/checkout", {"name": "ghost"}).status_code == 404


def test_checkout_remote_branch_creates_tracking(client, repo, tmp_path):
    origin = tmp_path / "o.git"; git(tmp_path, "init", "-q", "--bare", "-b", "main", str(origin))
    git(repo, "remote", "add", "origin", str(origin)); git(repo, "push", "-q", "origin", "main")
    git(repo, "checkout", "-q", "-b", "topic"); git(repo, "push", "-q", "origin", "topic")
    git(repo, "checkout", "-q", "main"); git(repo, "branch", "-q", "-D", "topic")
    r = post(client, repo, "branches/checkout", {"name": "origin/topic"}).json()
    assert r == {"branch": "topic", "created": True} and out(repo, "rev-parse", "--abbrev-ref", "topic@{upstream}") == "origin/topic"


def test_rename_branch(client, repo):
    git(repo, "branch", "old")
    assert post(client, repo, "branches/rename", {"old": "old", "new": "new/name"}).status_code == 200
    assert "new/name" in out(repo, "branch") and "old" not in out(repo, "branch").split()
    assert post(client, repo, "branches/rename", {"old": "new/name", "new": "main"}).status_code == 400
    assert post(client, repo, "branches/rename", {"old": "nope", "new": "q"}).status_code == 404
    assert post(client, repo, "branches/rename", {"old": "new/name", "new": "bad name"}).status_code == 400


def test_delete_branch_rules(client, repo):
    r = post(client, repo, "branches/delete", {"name": "main", "force": True})
    assert r.status_code == 400 and "checked out" in r.json()["detail"] and "main" in out(repo, "branch")
    git(repo, "branch", "merged")
    assert post(client, repo, "branches/delete", {"name": "merged"}).status_code == 200
    git(repo, "checkout", "-q", "-b", "wip"); (repo / "w.txt").write_text("w"); git(repo, "add", "-A"); git(repo, "commit", "-qm", "wip work")
    git(repo, "checkout", "-q", "main")
    r = post(client, repo, "branches/delete", {"name": "wip"})
    assert r.status_code == 409 and "not merged" in r.json()["detail"] and "wip" in out(repo, "branch")
    assert post(client, repo, "branches/delete", {"name": "wip", "force": True}).status_code == 200
    assert "wip" not in out(repo, "branch")
    assert post(client, repo, "branches/delete", {"name": "origin/x"}).status_code == 404


# ---- remotes --------------------------------------------------------------------------------------

@pytest.fixture
def remote(repo, tmp_path):
    origin = tmp_path / "o.git"; git(tmp_path, "init", "-q", "--bare", "-b", "main", str(origin))
    git(repo, "remote", "add", "origin", str(origin)); git(repo, "push", "-q", "-u", "origin", "main")
    other = tmp_path / "other"; git(tmp_path, "clone", "-q", str(origin), str(other))
    return origin, other


def test_no_remote_messages(client, repo):
    for op in ("fetch", "push"):
        r = post(client, repo, op)
        assert r.status_code == 400 and "no remote" in r.json()["detail"]
    assert "no upstream" in post(client, repo, "pull").json()["detail"]


def test_fetch_pull_push_round_trip(client, repo, remote):
    origin, other = remote
    (other / "from_other.txt").write_text("o"); git(other, "add", "-A"); git(other, "commit", "-qm", "other commit"); git(other, "push", "-q")
    assert post(client, repo, "fetch").status_code == 200
    assert out(repo, "rev-list", "--count", "main..origin/main") == "1" and not (repo / "from_other.txt").exists()   # fetch alone does not merge
    assert post(client, repo, "pull").status_code == 200 and (repo / "from_other.txt").exists()
    (repo / "mine.txt").write_text("m"); git(repo, "add", "-A"); git(repo, "commit", "-qm", "mine")
    assert post(client, repo, "push").status_code == 200
    assert out(origin, "rev-parse", "main") == out(repo, "rev-parse", "HEAD")


def test_push_sets_upstream_for_new_branch(client, repo, remote):
    git(repo, "checkout", "-q", "-b", "newbranch")
    r = post(client, repo, "push")
    assert r.status_code == 200 and "set it as the upstream" in r.json()["message"]
    assert out(repo, "rev-parse", "--abbrev-ref", "@{upstream}") == "origin/newbranch"


def test_pull_diverged_is_refused_without_merging(client, repo, remote):
    origin, other = remote
    (other / "o.txt").write_text("o"); git(other, "add", "-A"); git(other, "commit", "-qm", "theirs"); git(other, "push", "-q")
    (repo / "m.txt").write_text("m"); git(repo, "add", "-A"); git(repo, "commit", "-qm", "ours")
    head = out(repo, "rev-parse", "HEAD")
    r = post(client, repo, "pull")
    assert r.status_code == 409 and "diverged" in r.json()["detail"]
    assert out(repo, "rev-parse", "HEAD") == head and not (repo / "o.txt").exists()


def test_push_never_forces(client, repo, remote):
    origin, other = remote
    (other / "o.txt").write_text("o"); git(other, "add", "-A"); git(other, "commit", "-qm", "theirs"); git(other, "push", "-q")
    theirs = out(origin, "rev-parse", "main")
    (repo / "m.txt").write_text("m"); git(repo, "add", "-A"); git(repo, "commit", "-qm", "ours")
    r = post(client, repo, "push")
    assert r.status_code == 400 and out(origin, "rev-parse", "main") == theirs      # remote history intact


def test_detached_head_refused(client, repo):
    git(repo, "checkout", "-q", "--detach")
    assert "detached" in post(client, repo, "push").json()["detail"] and "detached" in post(client, repo, "pull").json()["detail"]


def test_unreachable_remote_gives_message_not_hang(client, repo, tmp_path):
    git(repo, "remote", "add", "origin", str(tmp_path / "does-not-exist.git"))
    r = post(client, repo, "fetch")
    assert r.status_code == 400 and r.json()["detail"]


def test_read_endpoints_still_read_only_after_ops(client, repo):
    (repo / "a.txt").write_text("a")
    before = snapshot(repo)
    for url in ("/api/overview", "/api/changes", "/api/branches", "/api/commits"):
        assert client.get(url, params={"repo": str(repo.resolve())}).status_code == 200
    assert snapshot(repo) == before
