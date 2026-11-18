import pytest
from fastapi.testclient import TestClient


def test_foreign_host_rejected():
    from app.main import app
    c = TestClient(app, base_url="http://evil.example.com")
    assert c.get("/api/health").status_code == 403


@pytest.mark.parametrize("origin", ["https://evil.example.com", "http://localhost:9999", "null"])
def test_cross_site_post_rejected(client, origin):
    r = client.post("/api/ops/fetch", params={"repo": "/x"}, headers={"Origin": origin})
    assert r.status_code == 403


@pytest.mark.parametrize("origin", ["http://127.0.0.1:8787", "http://localhost:5173"])
def test_own_origins_pass_guard(client, origin):
    r = client.post("/api/ops/fetch", params={"repo": "/x"}, headers={"Origin": origin})
    assert r.status_code == 404  # reached the app: repo simply is not opened


def test_get_unaffected_by_origin(client):
    assert client.get("/api/health", headers={"Origin": "https://evil.example.com"}).status_code == 200


def test_custom_port_from_env_is_allowed(monkeypatch):
    monkeypatch.setenv("GRX_PORT", "4600")
    from app.main import app
    from fastapi.testclient import TestClient
    c = TestClient(app, base_url="http://127.0.0.1:4600")
    from app.core.security import LocalOnlyMiddleware
    app.user_middleware.clear(); app.middleware_stack = None; app.add_middleware(LocalOnlyMiddleware)
    ok = c.post("/api/ops/fetch", params={"repo": "/x"}, headers={"Origin": "http://127.0.0.1:4600"})
    assert ok.status_code == 404                       # passed the guard
    bad = c.post("/api/ops/fetch", params={"repo": "/x"}, headers={"Origin": "http://127.0.0.1:4601"})
    assert bad.status_code == 403
