from typing import Optional
from pydantic import BaseModel


class LocaleData(BaseModel):
    """Locale data structure"""

    id: int
    name: str
    iso_code: str
