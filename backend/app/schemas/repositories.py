from pydantic import BaseModel


class PathBody(BaseModel):
    path: str


class FavouriteBody(BaseModel):
    path: str
    favourite: bool
