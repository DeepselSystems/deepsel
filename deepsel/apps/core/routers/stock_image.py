import logging
from fastapi import Depends, HTTPException, APIRouter
from deepsel.utils.stock_image import (
    StockImageProviderEnum,
    search_unsplash_provider,
    track_unsplash_download,
)
from deepsel.apps.core.schemas.stock_image import (
    SearchStockImagesRequest,
    TrackStockImageDownloadRequest,
)
from deepsel.auth.get_current_user import get_current_user
from settings import API_PREFIX

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix=f"{API_PREFIX}/stock-image",
    tags=["Stock image"],
    dependencies=[Depends(get_current_user)],
)


@router.post("/search")
def search_stock_images(request: SearchStockImagesRequest):
    """Search stock images from the configured provider."""
    if request.provider == StockImageProviderEnum.Unsplash.value:
        return search_unsplash_provider(
            query_str=request.query_str,
            page=request.page,
            per_page=request.per_page,
        )
    raise HTTPException(status_code=400, detail="Invalid provider")


@router.post("/track-download")
def track_download(request: TrackStockImageDownloadRequest):
    """Fire the Unsplash download-tracking event (required by Unsplash TOS)."""
    success = track_unsplash_download(request.download_location)
    return {"success": success}
