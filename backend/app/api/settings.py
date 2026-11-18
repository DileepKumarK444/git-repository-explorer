from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.schemas.settings import Settings
from app.services.repositories import settings as svc

router = APIRouter(prefix="/api")


@router.get("/settings")
def get_settings():
    return svc.load()


@router.put("/settings")
def put_settings(body: dict):
    merged = {**svc.load().model_dump(), **body}  # partial updates are fine
    try:
        return svc.save(Settings(**merged))
    except ValidationError as exc:
        e = exc.errors()[0]
        raise HTTPException(400, f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
