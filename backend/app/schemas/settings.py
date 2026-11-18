from typing import Literal

from pydantic import BaseModel, Field, field_validator


class Settings(BaseModel):
    theme: Literal["dark", "light", "system"] = "dark"
    git_path: str = ""                         # empty = use `git` from PATH
    default_compare_branch: str = ""
    default_diff: Literal["split", "unified"] = "split"
    default_repository: str = ""
    show_hidden_files: bool = False
    exclude_dirs: list[str] = Field(default_factory=lambda: [".git", "node_modules", ".venv", "venv", "dist", "build", "coverage"])
    file_sort: Literal["folders_first", "name"] = "folders_first"
    diff_wrap: bool = False
    diff_context: int = Field(3, ge=0, le=20)
    confirm_destructive: bool = True
    startup_screen: Literal["dashboard", "last_repository", "commits", "changes"] = "dashboard"
    history_limit: int = Field(50, ge=5, le=200)

    @field_validator("exclude_dirs")
    @classmethod
    def _dirs(cls, v: list[str]) -> list[str]:
        out = [d.strip().strip("/") for d in v if d.strip()]
        if any(".." in d.split("/") or d.startswith(("-", ":")) or "\0" in d for d in out):
            raise ValueError("Excluded folders must be plain folder names.")
        return out[:50]
