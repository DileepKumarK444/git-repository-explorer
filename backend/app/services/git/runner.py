"""The only place in the backend that starts a git process.

Arguments are always passed as a list with shell=False, so user input is never
interpreted by a shell. Read-only commands run with optional locks disabled so
that exploring a repository never rewrites its index.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.core.config import git_executable


class GitError(Exception):
    """git ran and failed."""

    def __init__(self, message: str, *, args_run: list[str], returncode: int, stderr: str):
        super().__init__(message)
        self.args_run = args_run
        self.returncode = returncode
        self.stderr = stderr


class GitNotFoundError(Exception):
    """The git executable could not be found or started."""


@dataclass(frozen=True)
class GitRunner:
    exe: str | None = None
    timeout: float = 30.0

    def _exe(self) -> str:
        exe = self.exe or git_executable()
        resolved = shutil.which(exe)
        if not resolved:
            raise GitNotFoundError(
                f"Git executable '{exe}' was not found. Install Git or set its path in Settings."
            )
        return resolved

    def run(self, args: list[str], cwd: Path | str, *, check: bool = True) -> str:
        return self.run_full(args, cwd, check=check)[1]

    def run_full(self, args: list[str], cwd: Path | str, *, check: bool = True) -> tuple[int, str, str]:
        """Returns (returncode, stdout, stderr). With check=True a non-zero exit raises GitError."""
        if not all(isinstance(a, str) for a in args):
            raise TypeError("git arguments must be strings")
        env = {
            **os.environ,
            "GIT_OPTIONAL_LOCKS": "0",
            "GIT_TERMINAL_PROMPT": "0",
            "LC_ALL": "C.UTF-8",
        }
        cmd = [self._exe(), "-c", "core.quotepath=false", *args]
        try:
            proc = subprocess.run(
                cmd, cwd=str(cwd), env=env, capture_output=True,
                text=True, encoding="utf-8", errors="replace",
                timeout=self.timeout, shell=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise GitError(
                f"git {args[0]} timed out after {self.timeout:.0f}s",
                args_run=args, returncode=-1, stderr="",
            ) from exc
        except FileNotFoundError as exc:
            raise GitNotFoundError(str(exc)) from exc
        if check and proc.returncode != 0:
            msg = proc.stderr.strip() or f"git {args[0]} failed with exit code {proc.returncode}"
            raise GitError(msg, args_run=args, returncode=proc.returncode, stderr=proc.stderr)
        return proc.returncode, proc.stdout, proc.stderr
