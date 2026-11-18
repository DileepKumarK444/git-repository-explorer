"""Guards for a service that is bound to localhost but modifies repositories.

* Host check: stops DNS-rebinding (a web page resolving its own domain to 127.0.0.1).
* Origin check on unsafe methods: stops other websites from making your browser POST to this app.
"""
from __future__ import annotations

import os
from urllib.parse import urlsplit

from starlette.responses import JSONResponse

LOCAL_HOSTS = {"127.0.0.1", "localhost", "[::1]", "::1"}
APP_PORTS = {8787, 5173}  # the app itself, and the Vite dev server


def _local(netloc_host: str | None, port: int | None, ports_ok: set[int] | None) -> bool:
    return netloc_host in LOCAL_HOSTS and (ports_ok is None or port in ports_ok or port is None)


class LocalOnlyMiddleware:
    def __init__(self, app, ports: set[int] = APP_PORTS):
        extra = os.environ.get("GRX_PORT", "")  # the port ./dev.sh (or App Hub) started the server on
        self.app, self.ports = app, ports | ({int(extra)} if extra.isdigit() else set())

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = {k.decode().lower(): v.decode() for k, v in scope["headers"]}
        host = urlsplit("//" + headers.get("host", ""))
        if not _local(host.hostname if host.hostname != "::1" else "::1", host.port, None):
            return await JSONResponse({"detail": "Requests must target localhost."}, status_code=403)(scope, receive, send)
        origin = headers.get("origin")
        if scope["method"] not in ("GET", "HEAD", "OPTIONS") and origin is not None:
            o = urlsplit(origin)
            if not _local(o.hostname, o.port or 80, self.ports | {80}):
                return await JSONResponse({"detail": "Cross-site request blocked."}, status_code=403)(scope, receive, send)
        return await self.app(scope, receive, send)
