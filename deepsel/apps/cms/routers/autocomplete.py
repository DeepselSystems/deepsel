from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from deepsel.deps import get_db, settings
from deepsel.auth.get_current_user import get_current_user
from deepsel.utils.models_pool import models_pool
import requests
import logging
from traceback import format_exc

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix=f"{settings.API_PREFIX}/autocomplete", tags=["Autocomplete APIs"]
)


class AutocompleteRequest(BaseModel):
    text: str
    cursor_position: int


class AutocompleteResponse(BaseModel):
    suggestions: list[str]
    completion: str = ""


def get_openrouter_client(organization_id: int, db: Session):
    """Get OpenRouter client configuration from organization settings"""
    try:
        # Get organization settings

        OrganizationModel = models_pool["organization"]
        settings_model = (
            db.query(OrganizationModel)
            .filter(OrganizationModel.id == organization_id)
            .first()
        )

        if not settings_model:
            logger.error(
                f"No organization settings found for org_id: {organization_id}"
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization settings not found",
            )

        if not settings_model.openrouter_api_key:
            logger.error("No OpenRouter API key configured")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OpenRouter API key not configured",
            )

        # Use the relationship like in page.py
        autocomplete_model = settings_model.ai_autocomplete_model
        if not autocomplete_model:
            logger.error("No autocomplete model configured")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="AI autocomplete model not configured",
            )

        model_string_id = getattr(autocomplete_model, "string_id", None)
        if not model_string_id:
            model_string_id = getattr(
                autocomplete_model, "canonical_slug", "google/gemini-2.5-flash-lite"
            )
            logger.warning(f"string_id not found, using fallback: {model_string_id}")

        config = {
            "api_key": settings_model.openrouter_api_key,
            "model": model_string_id,
            "organization_id": organization_id,
        }

        return config

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting OpenRouter client: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to configure AI provider",
        )


@router.post("/suggest", response_model=AutocompleteResponse)
async def get_autocomplete_suggestions(
    request: AutocompleteRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Get AI-powered autocomplete suggestions for text
    """
    try:
        organization_id = getattr(user, "current_organization_id", None)
        if organization_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Organization-Id header required",
            )

        # Get OpenRouter configuration
        config = get_openrouter_client(organization_id, db)

        # Extract text before cursor
        text_before_cursor = request.text[: request.cursor_position]

        # Find the current sentence from the last dot/exclamation/question mark
        sentence_delimiters = [".", "!", "?"]
        last_sentence_start = 0

        for delimiter in sentence_delimiters:
            last_pos = text_before_cursor.rfind(delimiter)
            if last_pos > last_sentence_start:
                last_sentence_start = last_pos + 1

        current_sentence = text_before_cursor[last_sentence_start:].strip()

        # Only proceed if we have a meaningful sentence to complete (at least 3 characters)
        if len(current_sentence) < 3:
            logger.info("Sentence too short, returning empty suggestions")
            return AutocompleteResponse(suggestions=[])

        # Determine if cursor is after a space
        text_before_cursor = request.text[: request.cursor_position]
        cursor_after_space = (
            text_before_cursor.endswith(" ") and len(text_before_cursor.strip()) > 0
        )

        # Create comprehensive prompt with full context
        prompt = f"""You are an AI writing assistant. Complete the current sentence naturally based on the context.

Full text context:
{request.text}

Current sentence fragment to complete:
{current_sentence}

SPACING RULE:
- If cursor is NOT after a space, start completion with a space
- If cursor IS after a space, continue completing without adding space

Current cursor position: {'AFTER SPACE - continue without space' if cursor_after_space else 'NOT AFTER SPACE - start with space'}

Provide only the completion text, nothing else. Be concise and natural.

Completion:"""

        # Call OpenRouter API
        headers = {
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://deepsel.com",
            "X-Title": "Deepsel CMS Autocomplete",
        }

        data = {
            "model": config["model"],
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 2000,
            "temperature": 0.7,
            "stop": ["\n", ".", "!", "?"],
        }

        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=data,
            timeout=15,
        )

        if response.status_code != 200:
            logger.error(
                f"OpenRouter API request failed with status code: {response.status_code}"
            )
            return AutocompleteResponse(suggestions=[])

        try:
            result = response.json()

            # Extract the completion using the same pattern as other OpenRouter calls
            if "choices" in result and len(result["choices"]) > 0:
                completion = result["choices"][0]["message"]["content"].strip()

                # Clean up the completion - remove any common prefixes
                if completion.lower().startswith("completion:"):
                    completion = completion[11:].strip()
                elif completion.lower().startswith("the completion is:"):
                    completion = completion[18:].strip()

                if completion:
                    # Generate some variations as suggestions
                    suggestions = [
                        completion,
                        completion + " ",
                        completion.split()[0] if completion.split() else completion,
                    ]
                    # Remove duplicates and empty strings
                    suggestions = list(set([s for s in suggestions if s]))

                    return AutocompleteResponse(
                        suggestions=suggestions[:3], completion=completion
                    )

            return AutocompleteResponse(suggestions=[])

        except Exception:
            logger.error("Error parsing OpenRouter response")
            logger.error(format_exc())
            return AutocompleteResponse(suggestions=[])

    except requests.exceptions.Timeout:
        logger.error("OpenRouter API timeout")
        return AutocompleteResponse(suggestions=[])
    except requests.exceptions.RequestException as e:
        logger.error(f"OpenRouter API request error: {e}")
        return AutocompleteResponse(suggestions=[])
    except Exception as e:
        logger.error(f"Error in autocomplete: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get autocomplete suggestions",
        )
