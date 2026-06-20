import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a translation assistant. Translate the text exactly as provided without "
    "adding any explanations or additional text."
)


def _flatten_content(content: dict[str, Any]) -> dict[str, str]:
    """Flatten nested dict content into dotted keys for translation."""
    flat: dict[str, str] = {}

    def _flatten(d: dict[str, Any], parent_key: str = "") -> None:
        for k, v in d.items():
            key = f"{parent_key}.{k}" if parent_key else k
            if isinstance(v, dict):
                _flatten(v, key)
            elif isinstance(v, str) and v.strip():
                flat[key] = v

    _flatten(content)
    return flat


def _unflatten_content(flat_content: dict[str, str]) -> dict[str, Any]:
    """Rebuild nested dict structure from dotted keys."""
    nested: dict[str, Any] = {}
    for key, value in flat_content.items():
        parts = key.split(".")
        d = nested
        for i, part in enumerate(parts):
            if i == len(parts) - 1:
                d[part] = value
            else:
                if part not in d or not isinstance(d[part], dict):
                    d[part] = {}
                d = d[part]
    return nested


async def _call_translation_api(
    url: str, headers: dict[str, str], payload: dict[str, Any]
) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()


async def translate_blog_content(
    content: dict[str, Any],
    source_locale: str,
    target_locale: str,
    org_settings: Any,
) -> dict[str, Any]:
    """
    Translate blog post content from source locale to target locale using OpenRouter or OpenAI.
    Returns original content on any failure or if translation is disabled/misconfigured.
    """
    try:
        if not org_settings or not org_settings.auto_translate_posts:
            return content

        openrouter_api_key = getattr(org_settings, "openrouter_api_key", None)
        openai_api_key = getattr(org_settings, "openai_api_key", None)

        if not (openrouter_api_key or openai_api_key) or not content:
            return content

        flat_content = _flatten_content(content)
        if not flat_content:
            return content

        keys = list(flat_content.keys())
        values = list(flat_content.values())

        prompt_lines = "\n".join(values)
        prompt = (
            f"Translate the following texts from {source_locale} to {target_locale}. "
            "Return only the translations in the same order, one per line:\n\n"
            f"{prompt_lines}"
        )

        if openrouter_api_key:
            result = await _call_translation_api(
                "https://openrouter.ai/api/v1/chat/completions",
                {
                    "Authorization": f"Bearer {openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://deepsel.com",
                    "X-Title": "Deepsel CMS",
                },
                {
                    "model": "google/gemini-flash-1.5-8b",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.3,
                },
            )
        elif openai_api_key:
            result = await _call_translation_api(
                "https://api.openai.com/v1/chat/completions",
                {
                    "Authorization": f"Bearer {openai_api_key}",
                    "Content-Type": "application/json",
                },
                {
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.3,
                },
            )
        else:
            return content

        if "choices" in result and len(result["choices"]) > 0:
            translations = (
                result["choices"][0]["message"]["content"].strip().split("\n")
            )

            if len(translations) == len(values):
                translated_flat = {keys[i]: translations[i] for i in range(len(keys))}
                return _unflatten_content(translated_flat)

        return content

    except Exception as exc:
        logger.warning("Translation error: %s", exc)
        return content
