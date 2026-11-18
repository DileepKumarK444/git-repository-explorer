from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.security import LocalOnlyMiddleware
from app.api import explorer, operations, repositories, settings
from app.services.git.runner import GitError, GitNotFoundError

app = FastAPI(title="Git Repository Explorer", version="0.1.0")
app.add_middleware(LocalOnlyMiddleware)
app.include_router(repositories.router)
app.include_router(explorer.router)
app.include_router(operations.router)
app.include_router(settings.router)


@app.exception_handler(GitError)
async def git_error(_: Request, exc: GitError):
    return JSONResponse({"detail": str(exc), "git_args": exc.args_run[:1]}, status_code=400)


@app.exception_handler(GitNotFoundError)
async def git_missing(_: Request, exc: GitNotFoundError):
    return JSONResponse({"detail": str(exc)}, status_code=503)


@app.get("/api/health")
def health():
    from app.services.git.runner import GitRunner
    try:
        version = GitRunner().run(["--version"], Path.home()).strip()
    except GitNotFoundError as exc:
        return {"ok": False, "git": None, "error": str(exc)}
    return {"ok": True, "git": version, "version": app.version}


# In production the built frontend is served by the same process.
_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
