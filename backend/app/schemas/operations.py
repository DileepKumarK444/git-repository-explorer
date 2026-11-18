from pydantic import BaseModel


class PathsBody(BaseModel):
    paths: list[str]


class DiscardBody(PathsBody):
    confirm: bool = False


class CommitBody(BaseModel):
    message: str
    description: str = ""


class CreateBranchBody(BaseModel):
    name: str
    start: str | None = None
    checkout: bool = False


class NameBody(BaseModel):
    name: str


class RenameBody(BaseModel):
    old: str
    new: str


class DeleteBranchBody(BaseModel):
    name: str
    force: bool = False


class TagCreateBody(BaseModel):
    name: str
    target: str | None = None
    message: str | None = None


class TagDeleteBody(BaseModel):
    name: str
    confirm: bool = False


class StashCreateBody(BaseModel):
    message: str | None = None
    include_untracked: bool = False


class StashBody(BaseModel):
    index: int
    confirm: bool = False
