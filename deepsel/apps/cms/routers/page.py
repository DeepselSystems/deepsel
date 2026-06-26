from typing import Any
from fastapi import Body, Depends, HTTPException, Path, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from ..utils.ai_writing import generate_page_content, generate_template_content
from ..schemas.ai_writing import (
    AIWritingContentType,
    AIWritingRequest,
    AIWritingResponse,
)
from ..schemas.openrouter_model import OpenRouterModelRead
from ..utils.get_page_content import get_page_content, PageContentResponse
from ..utils.search import SearchResponse, search_pages_and_posts
from ..utils.translate_page_content import translate_page_content
from deepsel.deps import get_db
from deepsel.auth.get_current_user import get_current_user, get_current_user_optional
from deepsel.utils.crud_router import CRUDRouter
from ..schemas.page import PageCreate, PageRead, PageSearch, PageUpdate
from deepsel.utils.models_pool import models_pool

table_name = "page"

router = CRUDRouter(
    read_schema=PageRead,
    search_schema=PageSearch,
    create_schema=PageCreate,
    update_schema=PageUpdate,
    table_name=table_name,
)


class TranslationRequest(BaseModel):
    content: dict[str, Any]
    sourceLocale: str
    targetLocale: str


@router.post("/translate")
async def translate_content(
    request: TranslationRequest = Body(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Translate page content from source locale to target locale"""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    # Get organization settings
    org_id = getattr(user, "current_organization_id", None)
    if org_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Organization-Id header required",
        )
    OrganizationModel = models_pool["organization"]
    org_settings = db.query(OrganizationModel).get(org_id)

    return await translate_page_content(
        content=request.content,
        source_locale=request.sourceLocale,
        target_locale=request.targetLocale,
        org_settings=org_settings,
    )


@router.get("/website/{lang}/{slug}", response_model=PageContentResponse)
def get_page_by_lang_and_slug(
    request: Request,
    lang: str = Path(..., description="Language ISO code"),
    slug: str = Path(..., description="Page slug"),
    preview: bool = Query(
        False, description="Enable preview mode to show unpublished pages"
    ),
    org_id: int = Query(None, description="Organization ID override for preview"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_optional),
) -> PageContentResponse:
    """Get page content by language and slug"""

    return get_page_content(
        request, lang, slug, preview, db, current_user, org_id=org_id
    )


@router.post("/ai_writing", response_model=AIWritingResponse)
async def ai_writing(
    request: AIWritingRequest = Body(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Use AI API to generate content based on user prompt"""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Get organization settings
    org_id = getattr(user, "current_organization_id", None)
    if org_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Organization-Id header required",
        )
    OrganizationModel = models_pool["organization"]
    org_settings = db.query(OrganizationModel).get(org_id)

    if not org_settings:
        raise HTTPException(status_code=400, detail="Organization settings not found")

    openrouter_api_key = org_settings.openrouter_api_key

    # If no API keys, return error
    if not openrouter_api_key:
        raise HTTPException(
            status_code=400,
            detail="No AI API keys configured. Please configure OpenRouter API key in site settings.",
        )

    openrouter_model = db.query(models_pool["openrouter_model"]).get(request.model_id)

    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    conversation_history = None
    if request.messages:
        conversation_history = [
            {"role": m.role, "content": m.content} for m in request.messages
        ]

    # Generate template content
    if request.content_type == AIWritingContentType.template:
        TemplateModel = models_pool["template"]
        # _check_has_permission intentionally skipped: caller is fully authenticated
        # (get_current_user), query is hard-scoped to the user's own org, and template
        # data is used as AI generation context only — never returned to the caller.
        existing_templates = (
            db.query(TemplateModel)
            .options(joinedload(TemplateModel.contents))
            .filter(
                TemplateModel.organization_id == org_id,
                TemplateModel.active.is_(True),
            )
            .order_by(TemplateModel.name)
            .all()
        )
        generated_content = await generate_template_content(
            prompt=request.prompt,
            model_string_id=openrouter_model.string_id,
            openrouter_api_key=openrouter_api_key,
            messages=conversation_history,
            existing_templates=existing_templates,
        )

    # Generate page content, blog post content, etc.
    else:
        generated_content = await generate_page_content(
            prompt=request.prompt,
            model_string_id=openrouter_model.string_id,
            openrouter_api_key=openrouter_api_key,
            messages=conversation_history,
        )

    return AIWritingResponse(
        title=generated_content.get("title", ""),
        content=generated_content.get("content", ""),
        model=OpenRouterModelRead.model_validate(openrouter_model),
        prompt=request.prompt,
    )


@router.get("/website_search/{lang}", response_model=SearchResponse)
async def website_search(
    request: Request,
    lang: str = Path(..., description="Language ISO code"),
    q: str = Query(..., description="Search query"),
    limit: int = Query(100, description="Maximum number of results", le=500),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_optional),
) -> SearchResponse:
    """Search through published pages and blog posts for a given language"""
    return await search_pages_and_posts(request, lang, q, limit, db, current_user)
