import subprocess
import time

import pytest


@pytest.fixture
def big(tmp_path, client):
    """3,000 commits and 600 files built with fast-import, so it is quick to generate."""
    p = tmp_path / "big"; p.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=p, check=True)
    lines, t = [], 1_600_000_000
    files = [f"d{d}/m{m}/f{i}.txt" for d in range(10) for m in range(6) for i in range(10)]
    for n in range(1, 3001):
        t += 600
        msg = f"commit {n}"
        lines.append(f"commit refs/heads/main\nmark :{n}\ncommitter A <a@x.io> {t} +0000\ndata {len(msg)}\n{msg}")
        if n > 1:
            lines.append(f"from :{n - 1}")
        for f in (files if n == 1 else files[n % 500:n % 500 + 3]):
            body = f"v{n}\n"
            lines.append(f"M 100644 inline {f}\ndata {len(body)}\n{body}")
        lines.append("")
    subprocess.run(["git", "fast-import", "--quiet"], cwd=p, input="\n".join(lines).encode(), check=True)
    subprocess.run(["git", "checkout", "-q", "main"], cwd=p, check=True)
    client.post("/api/repositories/open", json={"path": str(p)})
    return p


def timed(client, p, url, **params):
    t = time.perf_counter()
    r = client.get(url, params={"repo": str(p.resolve()), **params})
    return r, time.perf_counter() - t


def test_large_repo_endpoints_stay_responsive_and_bounded(client, big):
    checks = [("/api/overview", {}), ("/api/commits", {"limit": 100}), ("/api/commits", {"limit": 100, "skip": 2500}),
              ("/api/commits", {"path": "d3/m2/f5.txt", "limit": 50}), ("/api/files", {}), ("/api/changes", {}),
              ("/api/search/content", {"q": "v2999"}), ("/api/insights", {}), ("/api/branches", {})]
    for url, params in checks:
        r, dt = timed(client, big, url, **params)
        assert r.status_code == 200 and dt < 5, f"{url} {params} took {dt:.1f}s"
    assert len(client.get("/api/commits", params={"repo": str(big.resolve()), "limit": 100}).json()["commits"]) == 100


def test_page_size_is_capped(client, big):
    r = client.get("/api/commits", params={"repo": str(big.resolve()), "limit": 10_000})
    assert r.status_code == 422          # above the documented maximum of 200
