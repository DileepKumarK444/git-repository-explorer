import subprocess

import pytest
from conftest import git, snapshot


def out(cwd, *a):
    return subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def get(client, p, url, **params):
    return client.get(url, params={"repo": str(p.resolve()), **params})


def post(client, p, url, body=None):
    return client.post(f"/api/ops/{url}", params={"repo": str(p.resolve())}, json=body)


@pytest.fixture
def repo(make_repo, client):
    p = make_repo(commits=1)
    (p / "src").mkdir(); (p / "node_modules" / "pkg").mkdir(parents=True); (p / "docs").mkdir()
    (p / "src" / "app.py").write_text("def Hello():\n    return 'hello world'\n\n# TODO fix\nprint(Hello())\n")
    (p / "src" / "util.ts").write_text("export const hello = 1\n")
    (p / "docs" / "naïve notes.md").write_text("héllo wörld\n")
    (p / "node_modules" / "pkg" / "index.js").write_text("hello from deps\n")
    (p / ".gitignore").write_text("ignored.txt\n"); (p / "ignored.txt").write_text("hello ignored\n")
    git(p, "add", "-A", "-f"); git(p, "commit", "-q", "-m", "add sources")
    (p / "untracked.txt").write_text("hello untracked\n")
    client.post("/api/repositories/open", json={"path": str(p)})
    return p


def paths(r):
    return {f["path"] for f in r.json()["files"]}


# ---- search ---------------------------------------------------------------------------------------

def test_content_search_defaults(client, repo):
    r = get(client, repo, "/api/search/content", q="hello")
    assert r.status_code == 200
    ps = paths(r)
    assert {"src/app.py", "src/util.ts", "untracked.txt"} <= ps
    assert not any(p.startswith("node_modules/") for p in ps) and "ignored.txt" not in ps       # default excludes + gitignore


def test_content_search_flags(client, repo):
    assert paths(get(client, repo, "/api/search/content", q="hello", case="true")) == {"src/app.py", "src/util.ts", "untracked.txt"}
    assert paths(get(client, repo, "/api/search/content", q="Hello", case="true")) == {"src/app.py"}
    assert paths(get(client, repo, "/api/search/content", q="hell", word="true")) == set()
    assert "src/app.py" in paths(get(client, repo, "/api/search/content", q="hello", word="true"))
    assert paths(get(client, repo, "/api/search/content", q=r"hel+o\s+world", regex="true")) == {"src/app.py"}
    assert paths(get(client, repo, "/api/search/content", q="def .(", regex="false")) == set()   # fixed string, no regex error


def test_content_search_types_exclude_context(client, repo):
    assert paths(get(client, repo, "/api/search/content", q="hello", types="ts")) == {"src/util.ts"}
    assert "node_modules/pkg/index.js" in paths(get(client, repo, "/api/search/content", q="hello", exclude=""))
    assert "src/util.ts" not in paths(get(client, repo, "/api/search/content", q="hello", exclude="src"))
    r = get(client, repo, "/api/search/content", q="TODO", context=1).json()
    lines = r["files"][0]["lines"]
    assert [(l["line"], l["match"]) for l in lines] == [(3, False), (4, True), (5, False)]
    assert lines[1]["ranges"] == [[2, 6]]


def test_content_search_unicode_and_binary(client, repo):
    assert paths(get(client, repo, "/api/search/content", q="wörld")) == {"docs/naïve notes.md"}
    (repo / "b.bin").write_bytes(b"hello\0binary"); git(repo, "add", "b.bin")
    assert "b.bin" not in paths(get(client, repo, "/api/search/content", q="hello"))


def test_content_search_errors_and_empty(client, repo):
    r = get(client, repo, "/api/search/content", q="(unclosed", regex="true")
    assert r.status_code == 400 and r.json()["detail"]
    assert get(client, repo, "/api/search/content", q="").json()["total"] == 0
    assert get(client, repo, "/api/search/content", q="zzzz-nothing").json()["files"] == []
    assert get(client, repo, "/api/search/content", q="x", exclude="../etc").status_code == 400
    assert get(client, repo, "/api/search/content", q="x", types="py;rm").status_code == 400
    assert get(client, repo, "/api/search/content", q="--help").status_code == 200          # leading dash is just text


def test_content_search_truncates(client, repo):
    (repo / "many.txt").write_text("needle\n" * 600)
    r = get(client, repo, "/api/search/content", q="needle").json()
    assert r["total"] == 500 and r["truncated"]


def test_file_commit_ref_search(client, repo):
    assert get(client, repo, "/api/search/files", q="UTIL").json() == ["src/util.ts"]
    assert "docs/naïve notes.md" in get(client, repo, "/api/search/files", q="naïve").json()
    c = get(client, repo, "/api/search/commits", q="add sources").json()
    assert c[0]["subject"] == "add sources"
    assert get(client, repo, "/api/search/commits", q=c[0]["hash"][:7]).json()[0]["hash"] == c[0]["hash"]
    git(repo, "branch", "feature/search-me"); git(repo, "tag", "v-search")
    kinds = {(r["name"], r["kind"]) for r in get(client, repo, "/api/search/refs", q="search").json()}
    assert kinds == {("feature/search-me", "branch"), ("v-search", "tag")}


def test_search_is_read_only(client, repo):
    before = snapshot(repo)
    for u, p in [("content", {"q": "hello"}), ("files", {"q": "app"}), ("commits", {"q": "add"}), ("refs", {"q": "main"})]:
        assert get(client, repo, f"/api/search/{u}", **p).status_code == 200
    assert snapshot(repo) == before


# ---- tags -----------------------------------------------------------------------------------------

def test_tags_create_list_delete(client, repo):
    assert post(client, repo, "tags/create", {"name": "v1.0"}).status_code == 200
    assert post(client, repo, "tags/create", {"name": "v2.0", "target": "HEAD~1", "message": "Release two"}).status_code == 200
    tags = {t["name"]: t for t in get(client, repo, "/api/tags").json()}
    assert not tags["v1.0"]["annotated"] and tags["v1.0"]["commit"] == out(repo, "rev-parse", "HEAD")
    assert tags["v2.0"]["annotated"] and tags["v2.0"]["message"] == "Release two" and tags["v2.0"]["commit"] == out(repo, "rev-parse", "HEAD~1")
    r = post(client, repo, "tags/delete", {"name": "v1.0"})
    assert r.status_code == 409 and "v1.0" in out(repo, "tag")
    assert post(client, repo, "tags/delete", {"name": "v1.0", "confirm": True}).status_code == 200
    assert out(repo, "tag") == "v2.0"
    assert post(client, repo, "tags/delete", {"name": "nope", "confirm": True}).status_code == 404


@pytest.mark.parametrize("name", ["", "a b", "-x", "a..b", "x.lock", "v1:"])
def test_tag_bad_names(client, repo, name):
    assert post(client, repo, "tags/create", {"name": name}).status_code == 400


def test_tag_duplicate_and_bad_target(client, repo):
    post(client, repo, "tags/create", {"name": "dup"})
    assert "already exists" in post(client, repo, "tags/create", {"name": "dup"}).json()["detail"]
    assert post(client, repo, "tags/create", {"name": "t2", "target": "--bad"}).status_code == 400
    assert post(client, repo, "tags/create", {"name": "t2", "target": "nope"}).status_code == 400


# ---- stashes --------------------------------------------------------------------------------------

def test_stash_lifecycle(client, repo):
    (repo / "f0.txt").write_text("edited\n"); (repo / "new.txt").write_text("n\n")
    assert post(client, repo, "stashes/create", {"message": "my work", "include_untracked": True}).status_code == 200
    assert (repo / "f0.txt").read_text() == "0\n" and not (repo / "new.txt").exists()
    s = get(client, repo, "/api/stashes").json()
    assert len(s) == 1 and s[0]["message"] == "my work" and s[0]["branch"] == "main"
    files = {f["path"]: f for f in get(client, repo, "/api/stashes/0/files").json()}
    assert files["f0.txt"]["status"] == "M" and files["new.txt"]["untracked"]
    cmp = get(client, repo, "/api/compare", base="stash@{0}^1", target="stash@{0}", direct="true")
    assert cmp.status_code == 200 and "f0.txt" in {f["path"] for f in cmp.json()["files"]}
    assert post(client, repo, "stashes/apply", {"index": 0}).status_code == 200
    assert (repo / "f0.txt").read_text() == "edited\n" and len(get(client, repo, "/api/stashes").json()) == 1   # apply keeps it


def test_stash_pop_and_drop_rules(client, repo):
    (repo / "f0.txt").write_text("edited\n")
    post(client, repo, "stashes/create", {})
    assert post(client, repo, "stashes/pop", {"index": 0}).status_code == 200
    assert get(client, repo, "/api/stashes").json() == [] and (repo / "f0.txt").read_text() == "edited\n"
    post(client, repo, "stashes/create", {"message": "again"})
    r = post(client, repo, "stashes/drop", {"index": 0})
    assert r.status_code == 409 and len(get(client, repo, "/api/stashes").json()) == 1
    assert post(client, repo, "stashes/drop", {"index": 0, "confirm": True}).status_code == 200
    assert get(client, repo, "/api/stashes").json() == []
    assert post(client, repo, "stashes/pop", {"index": 0}).status_code == 404
    assert get(client, repo, "/api/stashes/5/files").status_code == 404


def test_stash_nothing_to_stash(client, repo):
    r = post(client, repo, "stashes/create", {})
    assert r.status_code == 400 and "no local changes" in r.json()["detail"].lower()


def test_stash_conflict_keeps_stash(client, repo):
    (repo / "f0.txt").write_text("stashed\n"); post(client, repo, "stashes/create", {})
    (repo / "f0.txt").write_text("different\n"); git(repo, "commit", "-qam", "conflicting change")
    r = post(client, repo, "stashes/pop", {"index": 0})
    assert r.status_code in (400, 409) and len(get(client, repo, "/api/stashes").json()) == 1


# ---- insights -------------------------------------------------------------------------------------

def test_insights(client, repo):
    (repo / "src" / "app.py").write_text("x\n"); git(repo, "commit", "-qam", "touch app")
    git(repo, "-c", "user.name=Other", "-c", "user.email=o@example.com", "commit", "-q", "--allow-empty", "-m", "other")
    d = get(client, repo, "/api/insights").json()
    assert d["commits"] == 4 and d["files"] >= 5 and d["branches"] == 1 and d["tags"] == 0
    assert {c["name"] for c in d["contributors"]} == {"T", "Other"} and sum(c["commits"] for c in d["contributors"]) == 4
    assert d["top_files"][0]["path"] == "src/app.py" and d["top_files"][0]["changes"] == 2
    assert d["top_dirs"][0]["path"] in ("src", "node_modules/pkg") and not d["scan_limited"]
    assert sum(w["commits"] for w in d["activity"]) == 4 and d["size_kib"] > 0


def test_insights_empty_repo(client, make_repo):
    p = make_repo("e", commits=0)
    client.post("/api/repositories/open", json={"path": str(p)})
    assert get(client, p, "/api/insights").json() == {"empty": True}
    assert get(client, p, "/api/tags").json() == [] and get(client, p, "/api/stashes").json() == []


def test_insights_merges_same_email_under_different_names(client, repo):
    git(repo, "-c", "user.name=T Two", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "alias")
    d = get(client, repo, "/api/insights").json()
    assert len(d["contributors"]) == 1 and d["contributors"][0]["commits"] == d["commits"] == 3


def test_history_excludes_stash_internals(client, repo):
    (repo / "f0.txt").write_text("edited\n"); (repo / "u.txt").write_text("u\n")
    post(client, repo, "stashes/create", {"include_untracked": True})
    subjects = [c["subject"] for c in get(client, repo, "/api/commits").json()["commits"]]
    assert subjects == ["add sources", "commit 0"] and not any("WIP" in s or "untracked files" in s for s in subjects)
    refs = {r["name"] for c in get(client, repo, "/api/commits").json()["commits"] for r in c["refs"]}
    assert "refs/stash" not in refs
