from fastapi import APIRouter

from settings import API_PREFIX

# Custom (non-CRUD) routers are a module-level `router` — install_routers()
# imports every module in routers/ and mounts `module.router`.
router = APIRouter(prefix=f"{API_PREFIX}/example", tags=["example"])


@router.get("/health")
def health():
    return {"status": "ok", "app": "deepsel.apps.example"}


@router.get("/hello")
def hello():
    return {"message": "Hello, world!"}
