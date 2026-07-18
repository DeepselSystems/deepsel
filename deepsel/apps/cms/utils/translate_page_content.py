import copy
import logging
from typing import Any, Optional

import httpx
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


async def translate_page_content(
    content: dict[str, Any],
    source_locale: str,
    target_locale: str,
    org_settings: Any,
) -> dict[str, Any]:
    """
    Translate page content (title and main HTML) using OpenRouter.
    Raises HTTPException if translation is disabled, misconfigured, or the
    provider fails to translate anything — callers must not treat a 200
    response as "translated" unless content actually came back translated.
    """
    if not org_settings or not getattr(org_settings, "auto_translate_pages", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auto Translate Pages is not enabled for this organization",
        )

    openrouter_api_key = getattr(org_settings, "openrouter_api_key", None)
    if not openrouter_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OpenRouter API key not configured",
        )

    if not content:
        return content

    try:
        if getattr(org_settings, "ai_translation_model", None):
            openrouter_model = org_settings.ai_translation_model.string_id
        else:
            openrouter_model = "google/gemini-2.5-flash-lite"

        result_dict = copy.deepcopy(content)
        fields_to_translate = 0
        translations_made = 0

        async with httpx.AsyncClient(timeout=30.0) as client:

            async def translate_single_text(
                text: str, content_type: str = "text"
            ) -> Optional[str]:
                if content_type == "html":
                    system_prompt = (
                        "You are a professional translator. Translate the HTML content while "
                        "preserving all HTML tags, attributes, and structure.\n\n"
                        "IMPORTANT RULES:\n"
                        "- Return ONLY the translated HTML content\n"
                        "- Do NOT wrap the output in code blocks (no ```html or ```)\n"
                        "- Do NOT add any explanations, prefixes, or suffixes\n"
                        "- The output must be ready-to-render HTML\n"
                        "- Preserve all HTML formatting, tags, and structure exactly"
                    )
                    user_prompt = f"Translate this HTML content from {source_locale} to {target_locale}:\n\n{text}"
                else:
                    system_prompt = (
                        "You are a professional translator. Return ONLY the translated text, "
                        "no explanations or additional content."
                    )
                    user_prompt = (
                        f"Translate from {source_locale} to {target_locale}: {text}"
                    )

                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {openrouter_api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://deepsel.com",
                        "X-Title": "Deepsel CMS",
                    },
                    json={
                        "model": openrouter_model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": 0.1,
                    },
                )

                if response.status_code == 200:
                    result = response.json()
                    if "choices" in result and result["choices"]:
                        content_out = result["choices"][0]["message"]["content"].strip()

                        if content_type == "html":
                            # Strip accidental markdown fences
                            if content_out.startswith("```html"):
                                content_out = content_out[7:]
                            elif content_out.startswith("```"):
                                content_out = content_out[3:]
                            if content_out.endswith("```"):
                                content_out = content_out[:-3]
                            content_out = content_out.strip()

                        return content_out

                logger.error(
                    "Translation failed for %s: %s", content_type, response.status_code
                )
                return None

            if (
                "title" in content
                and isinstance(content["title"], str)
                and content["title"].strip()
            ):
                fields_to_translate += 1
                translated_title = await translate_single_text(content["title"], "text")
                if translated_title:
                    result_dict["title"] = translated_title
                    translations_made += 1
                else:
                    logger.warning("Title translation failed, keeping original")

            if (
                "content" in content
                and isinstance(content["content"], str)
                and content["content"].strip()
            ):
                fields_to_translate += 1
                translated_html = await translate_single_text(
                    content["content"], "html"
                )
                if translated_html:
                    result_dict["content"] = translated_html
                    translations_made += 1
                else:
                    logger.warning("HTML content translation failed, keeping original")

    except Exception as exc:
        logger.error("Translation error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Translation request failed: {exc}",
        )

    if fields_to_translate > 0 and translations_made == 0:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Translation service did not return any translated content",
        )

    return result_dict
