from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from deepsel.deps import get_db, settings
from deepsel.utils.models_pool import models_pool
import json
import asyncio
import httpx
import re
import logging
import unicodedata
from ..utils.domain_detection import detect_domain_from_request

router = APIRouter(prefix=f"{settings.API_PREFIX}/chat", tags=["Chatbox APIs"])
logger = logging.getLogger(__name__)


class ChatHistoryItem(BaseModel):
    id: int
    type: str  # 'question' or 'answer'
    content: str
    timestamp: str


class ChatMessage(BaseModel):
    message: str
    history: list[ChatHistoryItem] = []


class ChatSource(BaseModel):
    title: str
    url: str
    type: str


# =============================================================================
# CONTENT SEARCH UTILITIES
# =============================================================================


def normalize_unicode_text(text: str) -> str:
    """Normalize Unicode text for better search matching"""
    if not text:
        return ""

    # Normalize Unicode to NFD (decomposed form) to handle accented characters
    normalized = unicodedata.normalize("NFD", text)

    # Remove diacritical marks (accents) for broader matching
    without_accents = "".join(
        char for char in normalized if unicodedata.category(char) != "Mn"
    )

    return without_accents.lower().strip()


def extract_text_from_content(content) -> str:
    """Extract content as-is from database without HTML modification"""
    if isinstance(content, str):
        return content.strip()
    return str(content) if content is not None else ""


def calculate_relevance_score(text: str, query: str) -> int:
    """Calculate how relevant content is to a search query (Unicode aware)"""
    # Normalize both text and query for Unicode-aware matching
    text_normalized = normalize_unicode_text(text)
    query_normalized = normalize_unicode_text(query)

    if not text_normalized or not query_normalized:
        return 0

    # Count exact phrase matches (weighted heavily)
    exact_matches = len(re.findall(re.escape(query_normalized), text_normalized))

    # Count individual word matches
    # Use Unicode-aware word splitting
    query_words = re.findall(r"\w+", query_normalized, re.UNICODE)
    word_matches = sum(1 for word in query_words if word in text_normalized)

    # Also check original case-sensitive matches for exact terms
    text_lower = text.lower()
    query_lower = query.lower()
    case_sensitive_matches = len(re.findall(re.escape(query_lower), text_lower))

    return exact_matches * 15 + word_matches * 3 + case_sensitive_matches * 5


def search_website_content(
    db: Session, organization_id: int, search_queries: list[str], user_input: str = ""
) -> list[dict]:
    """Search through published pages and blog posts for relevant content"""
    logger.info(f"=== CONTENT SEARCH STARTED ===")
    logger.info(f"User input: '{user_input}'")
    logger.info(f"Search queries: {search_queries}")

    # Log Unicode normalization info for debugging
    if search_queries:
        for query in search_queries:
            normalized = normalize_unicode_text(query)
            if query != normalized:
                logger.info(f"Unicode normalized: '{query}' → '{normalized}'")

    PageModel = models_pool["page"]
    PageContentModel = models_pool["page_content"]
    BlogPostModel = models_pool["blog_post"]
    BlogPostContentModel = models_pool["blog_post_content"]
    LocaleModel = models_pool["locale"]

    results = []

    # Search pages
    pages = (
        db.query(PageContentModel)
        .join(PageModel, PageContentModel.page_id == PageModel.id)
        .join(LocaleModel, PageContentModel.locale_id == LocaleModel.id)
        .filter(
            PageContentModel.published == True,
            PageModel.organization_id == organization_id,
        )
        .all()
    )

    logger.info(f"Found {len(pages)} published pages to search")

    for page_content in pages:
        title = page_content.title or ""
        content_text = extract_text_from_content(page_content.content)

        # Calculate best relevance score across all queries
        max_score = 0
        for query in search_queries:
            title_score = calculate_relevance_score(title, query)
            content_score = calculate_relevance_score(content_text, query)
            score = title_score * 2 + content_score  # Title weighted higher
            max_score = max(max_score, score)

        if max_score > 0:
            # Add language prefix to URL
            locale_code = page_content.locale.iso_code if page_content.locale else "en"
            base_url = page_content.slug or "/"
            url_with_lang = (
                f"/{locale_code}{base_url}"
                if not base_url.startswith(f"/{locale_code}")
                else base_url
            )

            results.append(
                {
                    "type": "page",
                    "title": title,
                    "url": url_with_lang,
                    "content": content_text,
                    "score": max_score,
                }
            )
            logger.info(
                f"Page match: '{title}' (score: {max_score}, url: {url_with_lang})"
            )

    # Search blog posts
    blog_posts = (
        db.query(BlogPostContentModel)
        .join(BlogPostModel, BlogPostContentModel.post_id == BlogPostModel.id)
        .join(LocaleModel, BlogPostContentModel.locale_id == LocaleModel.id)
        .filter(
            BlogPostContentModel.published == True,
            BlogPostModel.organization_id == organization_id,
        )
        .all()
    )

    logger.info(f"Found {len(blog_posts)} published blog posts to search")

    for post_content in blog_posts:
        title = post_content.title or ""
        content_text = extract_text_from_content(post_content.content)

        # Calculate best relevance score across all queries
        max_score = 0
        for query in search_queries:
            title_score = calculate_relevance_score(title, query)
            content_score = calculate_relevance_score(content_text, query)
            score = title_score * 2 + content_score
            max_score = max(max_score, score)

        if max_score > 0:
            # Get the blog post for URL with language prefix
            blog_post = post_content.post
            locale_code = post_content.locale.iso_code if post_content.locale else "en"
            url_with_lang = f"/{locale_code}/blog{blog_post.slug}"

            results.append(
                {
                    "type": "blog",
                    "title": title,
                    "url": url_with_lang,
                    "content": content_text,
                    "score": max_score,
                }
            )
            logger.info(
                f"Blog match: '{title}' (score: {max_score}, url: {url_with_lang})"
            )

    # Sort by relevance and return top 3
    results.sort(key=lambda x: x["score"], reverse=True)
    top_results = results[:3]

    logger.info(f"=== SEARCH RESULTS ===")
    logger.info(f"Total matches found: {len(results)}")
    logger.info(f"Top 3 results returned:")
    for i, result in enumerate(top_results, 1):
        logger.info(
            f"  {i}. {result['title']} ({result['type']}) - Score: {result['score']} - URL: {result['url']}"
        )
    logger.info(f"=== CONTENT SEARCH COMPLETED ===")

    return top_results


# =============================================================================
# LLM API UTILITIES
# =============================================================================


async def should_search_content(
    user_message: str, api_key: str, model: str
) -> list[str]:
    """Ask LLM if we need to search for content and get search queries"""
    if not api_key:
        return []

    prompt = f"""Analyze this user message and determine if they need information from website content.

User message: "{user_message}"

CRITICAL: Return ONLY valid JSON, no markdown, no code blocks, no explanations.

Set need_search to true for questions about products, services, documentation, or specific information.
Set need_search to true for questions relate to page, blog, post, article.
Set need_search to false for greetings, chitchat, or general questions.
If need_search is true, provide 2-3 focused search terms.

Response format (JSON only):
{{"need_search": true, "queries": ["term1", "term2"]}}"""

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://deepsel.com",
                    "X-Title": "DeepSel CMS",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.2,
                    "max_tokens": 150,
                },
            )

        if response.status_code == 200:
            result = response.json()
            content = result["choices"][0]["message"]["content"].strip()

            # Clean up potential markdown formatting
            if content.startswith("```json"):
                content = content.replace("```json", "").replace("```", "").strip()
            elif content.startswith("```"):
                content = content.replace("```", "").strip()

            try:
                parsed = json.loads(content)
                if parsed.get("need_search", False):
                    return [user_message] + parsed.get("queries", [])
            except json.JSONDecodeError as e:
                logger.error(
                    f"Error parse response generate search queries: {e}\nContent: {content}"
                )
        else:
            logger.error(
                f"Error request generate search queries. Status: {response.status_code}"
            )
        return []
    except Exception as e:
        logger.error(f"Search query generation failed: {e}")
        return []


async def generate_ai_response(
    user_message: str,
    context_content: list[dict],
    conversation_history: list[ChatHistoryItem],
    api_key: str,
    model: str,
) -> tuple[str, list[dict]]:
    """Generate AI response using LLM with context and history"""
    if not api_key:
        return "AI service not configured.", []

    # Build system prompt with context
    sources = []

    if context_content:
        # When context is available, prioritize it strongly
        system_parts = [
            "You are a helpful AI assistant for a website. Your primary role is to answer questions using the provided website content.",
            "",
            "INSTRUCTIONS:",
            "- Answer ONLY based on the website content provided below - do not add external knowledge",
            "- The content below has been extracted from web pages and may contain structured information, sections, and detailed explanations",
            "- Read through ALL the content carefully - information may be in different sections or parts",
            "- If information is not in the provided content, do not make assumptions or add details",
            "- Use the exact information from the content, presented in a natural conversational way",
            "- Write in a helpful tone, but stick strictly to what's provided in the content",
            "",
            "WEBSITE CONTENT:",
        ]

        for i, item in enumerate(context_content, 1):
            system_parts.append(
                f"\n=== SOURCE {i}: {item['title']} ({item['type']}) ==="
            )
            system_parts.append(f"URL: {item['url']}")
            system_parts.append(f"FULL CONTENT:\n{item['content']}")
            system_parts.append("=== END OF SOURCE ===\n")

            sources.append(
                {"title": item["title"], "url": item["url"], "type": item["type"]}
            )

        system_parts.extend(
            [
                "",
                "CRITICAL:",
                "- Only use information explicitly stated in the content above",
                "- Do not supplement with general knowledge or predictions",
                "- If the content doesn't fully answer the question, acknowledge what information is available",
                "- Present the available information naturally, but don't add explanations not in the content",
                "",
                "SOURCES INSTRUCTION - CRITICAL FORMAT:",
                "- You MUST end your response with EXACTLY this format: 'Used sources: [1]' or 'Used sources: [1, 2]'",
                "- Use square brackets with comma-separated numbers ONLY",
                "- Do NOT use any other format like 'sources: 1,2' or 'from source 1' or 'according to source 1'",
                "- Only list source numbers that directly contributed to your answer",
                "- Example correct formats: 'Used sources: [1]' or 'Used sources: [2, 3]'",
                "- This line must be the very last line of your response",
            ]
        )
    else:
        # Standard prompt when no context
        system_parts = [
            "You are a helpful AI assistant for a website. Answer questions clearly and concisely."
        ]

    # Add conversation history (last 6 messages)
    if conversation_history:
        system_parts.append("\nRECENT CONVERSATION:")
        for item in conversation_history[-6:]:
            role = "User" if item.type == "question" else "Assistant"
            system_parts.append(f"{role}: {item.content}")

    system_prompt = "\n".join(system_parts)
    user_prompt = f"Question: {user_message}"

    # Log the complete prompt for debugging
    logger.info("=== AI PROMPT DEBUG ===")
    logger.info(f"System prompt length: {len(system_prompt)} characters")
    logger.info(f"User prompt: {user_prompt}")
    logger.info("--- SYSTEM PROMPT START ---")
    logger.info(system_prompt)
    logger.info("--- SYSTEM PROMPT END ---")
    logger.info("=== END AI PROMPT DEBUG ===")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://deepsel.com",
                    "X-Title": "DeepSel CMS",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 2000,
                },
            )

        if response.status_code == 200:
            result = response.json()
            answer = result["choices"][0]["message"]["content"].strip()

            # Log the full AI response for debugging
            logger.info("=== AI RESPONSE DEBUG ===")
            logger.info(f"Full AI response length: {len(answer)} characters")
            logger.info("--- AI RESPONSE START ---")
            logger.info(answer)
            logger.info("--- AI RESPONSE END ---")
            logger.info("=== END AI RESPONSE DEBUG ===")

            # Parse which sources were actually used from the AI response
            used_sources = []
            if context_content and sources:
                # Look for "Used sources: [1, 3]" pattern in the response
                import re

                logger.info("=== SOURCES PARSING DEBUG ===")
                source_match = re.search(
                    r"Used sources?:?\s*\[([^\]]+)\]", answer, re.IGNORECASE
                )
                logger.info(f"Source regex pattern match: {source_match is not None}")

                if source_match:
                    logger.info(f"Matched text: '{source_match.group(0)}'")
                    logger.info(f"Source numbers text: '{source_match.group(1)}'")
                    try:
                        # Parse the source numbers
                        source_numbers = [
                            int(x.strip()) for x in source_match.group(1).split(",")
                        ]
                        logger.info(f"Parsed source numbers: {source_numbers}")

                        # Filter to only include sources that were actually used
                        used_sources = [
                            sources[i - 1]
                            for i in source_numbers
                            if 1 <= i <= len(sources)
                        ]
                        logger.info(f"Final used sources count: {len(used_sources)}")
                        for i, source in enumerate(used_sources):
                            logger.info(
                                f"  Used source {i + 1}: {source['title']} ({source['url']})"
                            )
                        # Remove the "Used sources:" line from the answer
                        answer = re.sub(
                            r"Used sources?:?\s*\[[^\]]+\]",
                            "",
                            answer,
                            flags=re.IGNORECASE,
                        ).strip()
                    except (ValueError, IndexError) as e:
                        # If parsing fails, return only first source as conservative fallback
                        used_sources = [sources[0]] if sources else []
                        logger.warning(
                            f"Failed to parse used sources from response: {e}, defaulting to first source"
                        )
                        logger.info(
                            f"Fallback source: {sources[0]['title']} ({sources[0]['url']})"
                            if sources
                            else "No sources available"
                        )
                else:
                    # If no "Used sources" found, return only first source as conservative fallback
                    used_sources = [sources[0]] if sources else []
                    logger.warning(
                        f"No 'Used sources' pattern found in AI response, defaulting to first source"
                    )
                    logger.info(
                        f"Fallback source: {sources[0]['title']} ({sources[0]['url']})"
                        if sources
                        else "No sources available"
                    )

                logger.info("=== END SOURCES PARSING DEBUG ===")

            return answer, used_sources

        return "I'm having trouble responding right now.", []

    except Exception as e:
        logger.error(f"AI response generation failed: {e}")
        return "Sorry, I encountered an error. Please try again.", []


# =============================================================================
# STREAMING UTILITIES
# =============================================================================


async def stream_text_response(text: str, delay: float = 0.05):
    """Stream text word by word"""
    words = text.split()
    accumulated = ""

    for i, word in enumerate(words):
        accumulated += word + (" " if i < len(words) - 1 else "")

        chunk = {"type": "content", "content": accumulated}
        yield f"data: {json.dumps(chunk)}\n\n"
        await asyncio.sleep(delay)


async def create_simple_response(message: str):
    """Create a simple streaming response without AI"""
    yield f"data: {json.dumps({'type': 'content', 'content': message})}\n\n"
    yield f"data: {json.dumps({'type': 'done'})}\n\n"


# =============================================================================
# MAIN ENDPOINT
# =============================================================================


@router.post("/stream")
async def chat_stream(
    request: Request,
    chat_message: ChatMessage,
    db: Session = Depends(get_db),
):
    """Main chat endpoint with AI-powered responses and content search"""
    try:
        # Get organization settings
        OrganizationModel = models_pool["organization"]
        domain = detect_domain_from_request(request)
        org = OrganizationModel.find_organization_by_domain(domain, db)

        # Check if AI is configured
        if not org or not org.openrouter_api_key:
            return StreamingResponse(
                create_simple_response(
                    "Hello! AI service isn't configured yet. Please contact support."
                ),
                media_type="text/plain",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
            )

        # Get AI model settings
        api_key = org.openrouter_api_key
        model = (
            org.chatbox_model.string_id
            if org.chatbox_model
            else "google/gemini-2.5-flash-lite"
        )

        async def generate_response():
            try:
                # Step 1: Determine if we need to search for content
                search_queries = await should_search_content(
                    chat_message.message, api_key, model
                )

                # Step 2: Search website content if needed
                context_content = []
                if search_queries:
                    context_content = search_website_content(
                        db, org.id, search_queries, chat_message.message
                    )

                # Step 3: Generate AI response with context
                answer, sources = await generate_ai_response(
                    chat_message.message,
                    context_content,
                    chat_message.history,
                    api_key,
                    model,
                )

                # Step 4: Stream the response
                async for chunk in stream_text_response(answer):
                    yield chunk

                # Step 5: Send sources if available
                if sources:
                    yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

                # Step 6: Signal completion
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

            except Exception as e:
                logger.error(f"Chat generation error: {e}")
                error_msg = "I encountered an error. Please try again."
                async for chunk in stream_text_response(error_msg):
                    yield chunk
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

        return StreamingResponse(
            generate_response(),
            media_type="text/plain",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )

    except Exception as e:
        logger.error(f"Chat endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
