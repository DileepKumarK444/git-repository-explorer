from conftest import git, snapshot
from app.services.repositories.inspect import inspect_repo


def test_valid_repo(make_repo):
    p = make_repo(commits=2)
    info = inspect_repo(str(p))
    assert info.valid and info.name == "repo" and info.branch == "main"
    assert info.has_commits and info.last_commit_message == "commit 1"
    assert info.modified == 0 and info.ahead is None


def test_not_a_repo(tmp_path):
    info = inspect_repo(str(tmp_path))
    assert not info.valid and "not a Git repository" in info.error


def test_missing_and_file(tmp_path):
    assert "does not exist" in inspect_repo(str(tmp_path / "nope")).error
    f = tmp_path / "a.txt"; f.write_text("x")
    assert "is a file" in inspect_repo(str(f)).error


def test_no_commits(make_repo):
    p = make_repo(commits=0)
    info = inspect_repo(str(p))
    assert info.valid and not info.has_commits and info.branch == "main"


def test_subdirectory_resolves_to_root(make_repo):
    p = make_repo()
    (p / "sub").mkdir()
    info = inspect_repo(str(p / "sub"))
    assert info.valid and info.root == str(p.resolve())


def test_status_counts(make_repo):
    p = make_repo()
    (p / "f0.txt").write_text("changed\n")
    (p / "new.txt").write_text("n")
    (p / "f1.txt").write_text("staged"); git(p, "add", "f1.txt")
    info = inspect_repo(str(p))
    assert info.modified == 2 and info.untracked == 1


def test_unicode_and_spaces(make_repo):
    p = make_repo()
    (p / "naïve file ü.txt").write_text("x")
    (p / "日本語.md").write_text("x")
    assert inspect_repo(str(p)).untracked == 2


def test_detached_head(make_repo):
    p = make_repo(commits=2)
    git(p, "checkout", "-q", "--detach", "HEAD~1")
    info = inspect_repo(str(p))
    assert info.detached and info.branch is None


def test_remote_ahead_behind(make_repo, tmp_path):
    origin = tmp_path / "origin.git"
    git(tmp_path, "init", "-q", "--bare", "-b", "main", str(origin))
    p = make_repo()
    git(p, "remote", "add", "origin", str(origin))
    git(p, "push", "-q", "-u", "origin", "main")
    (p / "x.txt").write_text("x"); git(p, "add", "-A"); git(p, "commit", "-q", "-m", "local")
    info = inspect_repo(str(p))
    assert info.upstream == "origin/main" and (info.ahead, info.behind) == (1, 0)


def test_no_remote_has_no_upstream(make_repo):
    assert inspect_repo(str(make_repo())).upstream is None


def test_inspection_is_read_only(make_repo):
    p = make_repo()
    (p / "dirty.txt").write_text("x")
    before = snapshot(p)
    inspect_repo(str(p)); inspect_repo(str(p))
    assert snapshot(p) == before
