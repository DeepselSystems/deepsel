from deepsel.utils.api_router import create_api_router

router = create_api_router("example", tags=["example"])


@router.get("/health")
def health():
    return {"status": "ok", "app": "deepsel.apps.example"}


@router.get("/hello")
def hello():
    return {"message": "Hello, world!"}
