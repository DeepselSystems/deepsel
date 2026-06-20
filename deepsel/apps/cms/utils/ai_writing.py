import json
import logging
import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

_PAGE_SYSTEM_PROMPT = """You are a professional content writer. Generate high-quality page content based on the user's request.

You MUST return a valid JSON object with exactly two fields:
- "title": A concise, compelling title for the content
- "content": The HTML body content

Format the "content" field as clean HTML using ONLY these allowed tags:
- <h2>, <h3>, <h4> for section headings (do NOT use <h1>, the title is separate)
- <ul> and <li> for unordered lists
- <ol> and <li> for ordered lists
- <strong> for bold text
- <p> for paragraphs

Rules:
1. Write engaging, well-structured content
2. Use appropriate HTML headings (h2-h4) and formatting
3. Make the content informative and valuable to readers
4. Keep a professional but friendly tone
5. Return ONLY the JSON object, no additional explanations or meta-text
6. Do not use any HTML tags other than the ones listed above
7. Ensure all HTML tags are properly closed

Example response:
{"title": "Getting Started with Project Management", "content": "<p>Introduction paragraph with <strong>important points</strong>.</p><h2>Section Title</h2><ul><li>First point</li><li>Second point</li></ul>"}"""


_TEMPLATE_SYSTEM_PROMPT = r"""You are an expert front-end engineer specializing in server-side Jinja2 HTML templates for the DeepSel CMS. Your job is to generate complete, production-ready Jinja2 template code based on the user's request.

================================================================
RESPONSE FORMAT (STRICT)
================================================================
You MUST return a single valid JSON object with exactly ONE field:
- "content": A string containing the complete Jinja2 + HTML template code.

Do NOT include a "title" field. Template names are chosen separately by the user.
Return ONLY the JSON object. No markdown fences, no commentary, no explanations before or after.

Example response:
{"content": "{% extends \"WebsiteLayout\" %}\n{% block content %}\n<section class=\"py-16\">...</section>\n{% endblock %}"}

The value of "content" must be the FULL template — never a skeleton, never a placeholder, never "// TODO". Produce finished, usable code every time.

================================================================
CHOOSING THE RIGHT TEMPLATE TYPE
================================================================
Before writing any code, infer the template type from the user's intent semantically.

GENERATE A PARTIAL (HTML fragment — NO DOCTYPE, NO <html>, NO <head>, NO <body>) when
the user describes a small/reusable UI element, something that accepts parameters
(title, link, label…), or anything meant to be embedded inside another template.

  Use plain Jinja2 variables directly — do NOT use {% macro %}. Macros defined inside
  an included template are never called automatically, producing blank output.
  Caller passes params via: {% with title='...' %}{% include 'ComponentName' %}{% endwith %}

  STRICT — comments:
  - Usage examples must be a SINGLE-LINE {# ... #} comment. Never write a multi-line
    {# block #} that contains another {# ... #} inside — Jinja2 does not support nested
    comments. The inner #} will prematurely close the outer comment, turning the
    remaining lines into live executed code and causing TemplateNotFound errors.
  - Correct:  {# Usage: {% with title='Learn more' %}{% include 'ComponentName' %}{% endwith %} #}
  - Wrong:    {# ... {# nested comment #} ... still-inside-outer ... #}

GENERATE A STANDALONE PAGE (full <!DOCTYPE html> … </html>) when the user describes
a complete webpage with full layout (nav, content, footer).

GENERATE A CHILD PAGE ({% extends %} + {% block content %}) when a layout template
exists in EXISTING TEMPLATES and the user asks for a page inside that layout.

WHEN IN DOUBT: PREFER PARTIAL.

================================================================
RENDERING ENVIRONMENT
================================================================
Templates are rendered with Jinja2 (DictLoader, HTML/XML autoescaping ON). Exactly
TWO context variables are injected plus ONE global function.

1) settings  — site-wide configuration (always present):
   - settings.id, settings.name, settings.domains
   - settings.available_languages  -> list of: .id, .name, .iso_code, .emoji_flag
   - settings.default_language     -> language object or None
   - settings.show_post_author, show_post_date, show_chatbox  -> bool
   - settings.website_custom_code  -> str | None
   - settings.selected_theme, settings.theme_key  -> str | None
   - settings.menus  -> FLAT LIST of top-level menu items (NOT a dict).
                        No settings.menus.main or settings.menus['key'].
                        Each item: .id, .position, .title, .url,
                        .open_in_new_tab (bool), .children (recursive list, same shape)

2) user  — authenticated user or None for anonymous visitors.
   ALWAYS guard with {% if user %}. Fields: .id, .name, .first_name, .last_name
   No user.email, no user.role, no user.avatar.

Do NOT reference page, post, request, csrf, url_for, blog, products — not in context.
Autoescaping is ON for {{ ... }}. Only attachment() output is pre-marked safe.

================================================================
GLOBAL FUNCTION: attachment(...)
================================================================
Resolves a CMS media file by NAME and returns ready-to-embed HTML (img/audio/video/a
auto-detected). Call inside {{ ... }}, do NOT wrap in your own media tag.

  Single:    {{ attachment('hero-banner') }}
  With opts: {{ attachment('hero-banner', {'width': 800, 'alignment': 'center'}) }}
    Image keys: width, height, alignment ('left'|'center'|'right'), rounded, circle, inline, description
    Audio: width. Video: poster.
  Gallery:   {{ attachment('img1', 'img2', 'img3') }}
    Gallery config: imagesPerRow, gap, maxWidth, rounded

  Output is already safe — do NOT pipe through |safe.
  Unknown name → "File not found" placeholder (expected, not an error).
  Only use names the user provided; otherwise: {{ attachment('REPLACE_WITH_IMAGE_NAME') }}

================================================================
TEMPLATE INHERITANCE IN THIS CMS
================================================================
Templates reference each other by bare name — no path, no .html extension.
When a theme is active, the CMS injects content into {% block content %} — put all
real page content inside that block.

CRITICAL: Use names from EXISTING TEMPLATES only in {% extends %} and {% include %}.
If no layout template exists, do NOT use {% extends %}.

================================================================
EXAMPLE — settings.menus with dropdown children
================================================================
  <nav>
    {% for item in settings.menus %}
      <a href="{{ item.url }}" {% if item.open_in_new_tab %}target="_blank" rel="noopener"{% endif %}>
        {{ item.title }}
      </a>
      {% if item.children %}
        <ul>
          {% for child in item.children %}
            <li><a href="{{ child.url }}" {% if child.open_in_new_tab %}target="_blank" rel="noopener"{% endif %}>{{ child.title }}</a></li>
          {% endfor %}
        </ul>
      {% endif %}
    {% endfor %}
  </nav>

================================================================
STYLING & NAMING
================================================================
- Use whatever CSS approach the user specifies. If not specified, use plain HTML
  with minimal inline styles or semantic class names — do NOT assume any CSS framework.
- No raw <style> blocks unless explicitly requested.
- Template names are PascalCase: WebsiteLayout, NavBar, HeroSection, ContactForm.

Produce complete, valid Jinja2 templates that render correctly in this environment."""


def _build_existing_templates_section(existing_templates: list) -> str:
    """Build a prompt section listing templates already in the DB for this org."""
    lines = [
        "",
        "================================================================",
        "EXISTING TEMPLATES IN THIS SITE",
        "================================================================",
    ]

    if not existing_templates:
        lines += [
            "There are NO templates in this site yet.",
            "",
            "STRICT RULES when no templates exist:",
            "- Do NOT use {% extends %} — there is no layout to extend.",
            "- Do NOT use {% include %} — there are no components to include.",
            "- Generate a fully self-contained standalone template with complete",
            "  HTML structure (<!DOCTYPE html> ... </html>) if a full page is needed,",
            "  or a standalone HTML fragment if a component is requested.",
        ]
        return "\n".join(lines)

    # Detect layout templates: contain {% block content %}
    layout_names = []
    component_names = []
    for tpl in existing_templates:
        name = tpl.name or ""
        content_str = ""
        if tpl.contents:
            content_str = tpl.contents[0].content or ""
        if "{% block content %}" in content_str or "{%block content%}" in content_str:
            layout_names.append(name)
        else:
            component_names.append(name)

    if layout_names:
        lines.append("Layout templates (can be used with {% extends %}):")
        for name in layout_names:
            lines.append(f'  - "{name}"')
    else:
        lines += [
            "Layout templates: NONE",
            "→ Do NOT use {% extends %}. No layout template exists yet.",
        ]

    lines.append("")
    if component_names:
        lines.append("Component templates (can be used with {% include %}):")
        for tpl in existing_templates:
            if tpl.name in component_names:
                preview = ""
                if tpl.contents:
                    raw = (tpl.contents[0].content or "").strip()
                    if raw:
                        preview = raw[:100].replace("\n", " ")
                        if len(raw) > 100:
                            preview += "..."
                entry = f'  - "{tpl.name}"'
                if preview:
                    entry += f" — {preview}"
                lines.append(entry)
    else:
        lines.append("Component templates: NONE — do not use {% include %}.")

    lines += [
        "",
        "STRICT RULE: Only use template names from the lists above in {% extends %}",
        "and {% include %}. Never invent or assume a template name not in this list.",
    ]
    return "\n".join(lines)


async def _call_openrouter(
    model_string_id: str,
    openrouter_api_key: str,
    api_messages: list[dict],
    max_tokens: int = 5000,
) -> str:
    """Send a chat completion request to OpenRouter and return the raw text response."""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://deepsel.com",
                    "X-Title": "DeepSel CMS",
                },
                json={
                    "model": model_string_id,
                    "messages": api_messages,
                    "temperature": 0.7,
                    "max_tokens": max_tokens,
                },
            )
            response.raise_for_status()

            result = response.json()
            if "choices" in result and len(result["choices"]) > 0:
                raw = result["choices"][0]["message"]["content"].strip()
                if raw.startswith("```"):
                    lines = raw.split("\n")
                    lines = [
                        line for line in lines if not line.strip().startswith("```")
                    ]
                    raw = "\n".join(lines).strip()
                return raw

            logger.error("Unexpected AI API response format: %s", result)
            raise HTTPException(
                status_code=500, detail="Unexpected response from AI API"
            )

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504, detail="AI API request timed out. Please try again."
        )
    except httpx.HTTPStatusError as exc:
        logger.error(
            "AI API request failed: %s - %s",
            exc.response.status_code if exc.response else "unknown",
            exc.response.text if exc.response else "no response text",
        )
        raise HTTPException(
            status_code=500,
            detail=f"AI API request failed: {exc.response.status_code if exc.response else 'unknown'}",
        )
    except httpx.RequestError as exc:
        logger.error("AI API request error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to connect to AI API")
    except Exception as exc:
        logger.error("AI API error: %s", exc)
        raise HTTPException(
            status_code=500, detail="An error occurred while calling AI API"
        )


async def generate_template_content(
    prompt: str,
    model_string_id: str,
    openrouter_api_key: str,
    messages: list[dict] | None = None,
    existing_templates: list | None = None,
) -> dict:
    """Call OpenRouter to generate a complete Jinja2 HTML template.

    Returns only a "content" field — template names are set separately by the user.
    existing_templates is a list of ORM template objects fetched by the caller.
    """
    existing_section = _build_existing_templates_section(existing_templates or [])
    system_prompt = _TEMPLATE_SYSTEM_PROMPT + existing_section

    if messages:
        api_messages = [{"role": "system", "content": system_prompt}] + messages
    else:
        api_messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Create a Jinja2 template: {prompt}"},
        ]

    raw = await _call_openrouter(
        model_string_id, openrouter_api_key, api_messages, max_tokens=8000
    )
    try:
        parsed = json.loads(raw)
        return {"content": parsed.get("content", "")}
    except json.JSONDecodeError:
        return {"content": raw}


async def generate_page_content(
    prompt: str,
    model_string_id: str,
    openrouter_api_key: str,
    messages: list[dict] | None = None,
) -> dict:
    """Call OpenRouter to generate page content HTML with title."""
    if messages:
        api_messages = [{"role": "system", "content": _PAGE_SYSTEM_PROMPT}] + messages
    else:
        api_messages = [
            {"role": "system", "content": _PAGE_SYSTEM_PROMPT},
            {"role": "user", "content": f"Create page content: {prompt}"},
        ]

    raw = await _call_openrouter(
        model_string_id, openrouter_api_key, api_messages, max_tokens=5000
    )
    try:
        parsed = json.loads(raw)
        return {"title": parsed.get("title", ""), "content": parsed.get("content", "")}
    except json.JSONDecodeError:
        return {"title": "", "content": raw}
