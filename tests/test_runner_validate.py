import pytest
from app.services.git.runner import GitError, GitNotFoundError, GitRunner
from app.services.git.validate import resolve_inside, valid_ref_name


def test_missing_git_executable(tmp_path):
    with pytest.raises(GitNotFoundError, match="not found"):
        GitRunner(exe="definitely-not-git").run(["--version"], tmp_path)


def test_git_error_has_stderr(tmp_path):
    with pytest.raises(GitError) as e:
        GitRunner().run(["rev-parse", "--show-toplevel"], tmp_path)
    assert "not a git repository" in e.value.stderr.lower()


def test_args_are_not_shell_interpreted(make_repo):
    p = make_repo()
    with pytest.raises(GitError):
        GitRunner().run(["log", "main; touch pwned"], p)
    assert not (p / "pwned").exists()


@pytest.mark.parametrize("name", ["feature/x", "fix-1", "release/1.8", "ünï"])
def test_good_refs(name):
    assert valid_ref_name(name) is None


@pytest.mark.parametrize("name", ["", "-x", "a b", "a..b", "a~1", "x.lock", "a/", "a:b", "a@{1}", "@", "a\\b"])
def test_bad_refs(name):
    assert valid_ref_name(name)


def test_resolve_inside(tmp_path):
    (tmp_path / "a").mkdir()
    assert resolve_inside(tmp_path, "a") == (tmp_path / "a").resolve()
    for bad in ["../x", "/etc/passwd", "a/../../x", ".git/config", "a/.git/HEAD"]:
        with pytest.raises(ValueError):
            resolve_inside(tmp_path, bad)


def test_symlink_escape_refused(tmp_path):
    outside = tmp_path / "outside"; outside.mkdir()
    root = tmp_path / "root"; root.mkdir()
    (root / "link").symlink_to(outside)
    with pytest.raises(ValueError):
        resolve_inside(root, "link/secret")
