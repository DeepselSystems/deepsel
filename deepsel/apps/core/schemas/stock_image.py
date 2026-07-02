from pydantic import BaseModel, Field, field_validator


class SearchStockImagesRequest(BaseModel):
    """Request model for searching stock images."""

    provider: str
    query_str: str = Field(default="")
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=24, ge=1, le=80)


class TrackStockImageDownloadRequest(BaseModel):
    """Request to fire an Unsplash download-tracking event."""

    download_location: str

    @field_validator("download_location")
    @classmethod
    def _must_be_unsplash(cls, v: str) -> str:
        if not v.startswith("https://api.unsplash.com/"):
            raise ValueError("download_location must be an Unsplash API URL")
        return v
