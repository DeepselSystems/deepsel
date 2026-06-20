from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict


class FormSubmissionPublicRead(BaseModel):
    """Safe public projection of a submission — omits submitter_ip, submitter_user_agent,
    submitter_user_id, and submission_versions to prevent PII exposure on public URLs.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    form_id: int
    form_content_id: int
    submission_data: dict[str, Any]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
