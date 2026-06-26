import logging
import re
from typing import Optional
from pydantic import BaseModel
from fastapi import HTTPException, Request, Query, Path, Depends
from sqlalchemy import func, text as sa_text
from sqlalchemy.orm import Session
from deepsel.deps import get_db, settings
from deepsel.auth.get_current_user import get_current_user_optional
from .domain_detection import detect_domain_from_request
from deepsel.utils.models_pool import models_pool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Plain-text extraction helpers
# ---------------------------------------------------------------------------


def strip_html_tags(html: str) -> str:
    """Remove HTML tags and collapse whitespace to plain text."""
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).strip()


def extract_page_plain_text(content: str) -> str:
    """Extract plain text from HTML content string."""
    if not content:
        return ""
    return strip_html_tags(content)


"""
Number of characters to include on each side of the first keyword match.
Increase for more context, decrease for tighter excerpts.
"""
_SNIPPET_CONTEXT_CHARS = 120

"""
Maximum total characters in the returned snippet string.
Prevents very long snippets when keyword is near the start of a large document.
"""
_SNIPPET_MAX_CHARS = 350


def _generate_snippet(
    content: str, query_words: list[str], context_chars: int = _SNIPPET_CONTEXT_CHARS
) -> str:
    """
    Build a keyword-highlighted text excerpt from raw HTML content.

    Steps:
      1. Strip HTML tags → plain text
      2. Find the first occurrence of any query word (substring, case-insensitive)
      3. Slice ~context_chars characters either side of that match
      4. Wrap ALL occurrences of any query word with <mark>…</mark>

    This gives true substring matching: searching 'auth' highlights 'author',
    'authority', 'authentication', etc.
    """
    if not content or not query_words:
        return ""

    plain = strip_html_tags(content)
    if not plain:
        return ""

    # Build a single regex that matches any of the query words as substrings
    pattern = "|".join(re.escape(w) for w in query_words if w)
    if not pattern:
        return plain[:_SNIPPET_MAX_CHARS]

    # Find the first match to centre the excerpt window
    first_match = re.search(pattern, plain, re.IGNORECASE)
    if first_match:
        start = max(0, first_match.start() - context_chars)
        end = min(len(plain), first_match.end() + context_chars)
    else:
        start, end = 0, min(len(plain), _SNIPPET_MAX_CHARS)

    prefix = "… " if start > 0 else ""
    suffix = " …" if end < len(plain) else ""
    excerpt = prefix + plain[start:end] + suffix

    # Cap total length
    if len(excerpt) > _SNIPPET_MAX_CHARS:
        excerpt = excerpt[:_SNIPPET_MAX_CHARS] + " …"

    # Highlight ALL substring occurrences with <mark>
    highlighted = re.sub(
        f"({pattern})",
        r"<mark>\1</mark>",
        excerpt,
        flags=re.IGNORECASE,
    )
    return highlighted


def _build_prefix_tsquery(q: str):
    """
    Build a PostgreSQL prefix tsquery from a user query string.

    Each word in the query gets a ':*' suffix so that it matches any word
    that STARTS WITH that token — e.g. 'manage' matches 'management', 'manager'.

    Words are sanitised to word-characters only before building the query,
    preventing tsquery syntax injection.

    Examples:
        'manage'         → to_tsquery('simple', 'manage:*')
        'project manage' → to_tsquery('simple', 'project:* & manage:*')
    """
    words = re.findall(r"\w+", q.lower().strip())
    if not words:
        return func.plainto_tsquery("simple", q.strip())
    tsquery_str = " & ".join(f"{w}:*" for w in words)
    return func.to_tsquery("simple", tsquery_str)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class SearchResultItem(BaseModel):
    """Single search result item"""

    id: str
    title: str
    url: str
    publishDate: Optional[str] = None
    contentType: str  # "Blog" or "Page"
    relevanceScore: float
    snippet: Optional[str] = None  # Keyword-highlighted excerpt (contains <mark> tags)


class SearchResponse(BaseModel):
    """Search response containing pages and blog posts"""

    results: list[SearchResultItem]
    total: int
    suggestions: list[str] = []


# ---------------------------------------------------------------------------
# Main search endpoint
# ---------------------------------------------------------------------------


async def search_pages_and_posts(
    request: Request,
    lang: str = Path(..., description="Language ISO code"),
    q: str = Query(..., description="Search query"),
    limit: int = Query(100, description="Maximum number of results", le=500),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_optional),
) -> SearchResponse:
    """
    Search published pages and blog posts.

    Matching: PostgreSQL prefix tsquery (word:*) — each query word matches any
    word that STARTS WITH it, so 'auth' matches 'author', 'authority', etc.

    Snippet: generated in Python with regex substring highlighting — any query
    word that APPEARS ANYWHERE (as a substring) inside the excerpt is wrapped
    in <mark>…</mark>, so 'auth' highlights 'auth' inside 'author'.
    """
    if not q or not q.strip():
        return SearchResponse(results=[], total=0)

    # --- Org detection ---
    domain = detect_domain_from_request(request)
    OrganizationModel = models_pool["organization"]
    org_settings = OrganizationModel.find_organization_by_domain(domain, db)

    if not org_settings:
        org_settings = (
            db.query(OrganizationModel)
            .filter(OrganizationModel.id == settings.DEFAULT_ORG_ID)
            .first()
        )
    if not org_settings:
        raise HTTPException(status_code=404, detail="No organization available")

    org_id = org_settings.id

    default_lang = (
        org_settings.default_language.iso_code
        if org_settings.default_language
        else None
    ) or lang

    # --- Models ---
    LocaleModel = models_pool["locale"]
    PageModel = models_pool["page"]
    PageContentModel = models_pool["page_content"]
    BlogPostModel = models_pool["blog_post"]
    BlogPostContentModel = models_pool["blog_post_content"]

    # --- Build prefix tsquery and extract query words for snippet ---
    search_query = _build_prefix_tsquery(q)
    query_words = re.findall(r"\w+", q.lower().strip())

    results: list[SearchResultItem] = []

    # --- Page results ---
    try:
        page_q = (
            db.query(
                PageContentModel.id,
                PageContentModel.title,
                PageContentModel.slug,
                PageContentModel.content,
                PageModel.updated_at,
                PageModel.id.label("page_id"),
                LocaleModel.iso_code,
                func.ts_rank(PageContentModel.search_vector, search_query).label(
                    "rank"
                ),
            )
            .join(PageModel, PageModel.id == PageContentModel.page_id)
            .join(LocaleModel, LocaleModel.id == PageContentModel.locale_id)
            .filter(
                PageModel.organization_id == org_id,
                PageContentModel.published.is_(True),
                LocaleModel.iso_code == lang,
                PageContentModel.search_vector.op("@@")(search_query),
            )
        )
        if not current_user:
            page_q = page_q.filter(PageModel.require_login.is_(False))

        page_q = page_q.order_by(sa_text("rank DESC")).limit(limit)

        for row in page_q.all():
            url = row.slug
            if row.iso_code != default_lang:
                url = f"/{row.iso_code}{row.slug}"
            results.append(
                SearchResultItem(
                    id=f"page-{row.page_id}-{row.iso_code}",
                    title=row.title,
                    url=url,
                    publishDate=(
                        row.updated_at.isoformat() if row.updated_at else None
                    ),
                    contentType="Page",
                    relevanceScore=float(row.rank),
                    snippet=_generate_snippet(row.content, query_words) or None,
                )
            )
    except Exception as e:
        logger.error(f"Error searching pages: {e}")

    # --- Blog post results ---
    try:
        blog_q = (
            db.query(
                BlogPostContentModel.id,
                BlogPostContentModel.title,
                BlogPostModel.slug,
                BlogPostContentModel.content,
                BlogPostModel.publish_date,
                BlogPostModel.id.label("post_id"),
                LocaleModel.iso_code,
                func.ts_rank(BlogPostContentModel.search_vector, search_query).label(
                    "rank"
                ),
            )
            .join(BlogPostModel, BlogPostModel.id == BlogPostContentModel.post_id)
            .join(LocaleModel, LocaleModel.id == BlogPostContentModel.locale_id)
            .filter(
                BlogPostModel.organization_id == org_id,
                BlogPostContentModel.published.is_(True),
                LocaleModel.iso_code == lang,
                BlogPostContentModel.search_vector.op("@@")(search_query),
            )
        )
        if not current_user:
            blog_q = blog_q.filter(BlogPostModel.require_login.is_(False))

        blog_q = blog_q.order_by(sa_text("rank DESC")).limit(limit)

        for row in blog_q.all():
            url = f"/blog/{row.slug}"
            if row.iso_code != default_lang:
                url = f"/{row.iso_code}/blog/{row.slug}"
            results.append(
                SearchResultItem(
                    id=f"blog-{row.post_id}-{row.iso_code}",
                    title=row.title,
                    url=url,
                    publishDate=(
                        row.publish_date.isoformat() if row.publish_date else None
                    ),
                    contentType="Blog",
                    relevanceScore=float(row.rank),
                    snippet=_generate_snippet(row.content, query_words) or None,
                )
            )
    except Exception as e:
        logger.error(f"Error searching blog posts: {e}")

    # --- Sort combined results by relevance ---
    results.sort(key=lambda r: r.relevanceScore, reverse=True)
    results = results[:limit]

    # --- Suggestions via pg_trgm when no results ---
    suggestions: list[str] = []
    if not results and q.strip():
        try:
            rows = db.execute(
                sa_text("""
                    SELECT DISTINCT word
                    FROM (
                        SELECT unnest(string_to_array(lower(pc.title), ' ')) AS word
                        FROM page_content pc
                        JOIN page p ON p.id = pc.page_id
                        JOIN locale l ON l.id = pc.locale_id
                        WHERE p.organization_id = :org_id
                          AND pc.published = true
                          AND l.iso_code = :lang
                        UNION
                        SELECT unnest(string_to_array(lower(bpc.title), ' ')) AS word
                        FROM blog_post_content bpc
                        JOIN blog_post bp ON bp.id = bpc.post_id
                        JOIN locale l ON l.id = bpc.locale_id
                        WHERE bp.organization_id = :org_id
                          AND bpc.published = true
                          AND l.iso_code = :lang
                    ) words
                    WHERE length(word) > 2
                      AND similarity(word, :query) > 0.3
                    ORDER BY similarity(word, :query) DESC
                    LIMIT 3
                """),
                {"org_id": org_id, "lang": lang, "query": q.lower().strip()},
            )
            suggestions = [row[0] for row in rows]
        except Exception as e:
            logger.warning(f"Could not generate search suggestions: {e}")

    return SearchResponse(results=results, total=len(results), suggestions=suggestions)
