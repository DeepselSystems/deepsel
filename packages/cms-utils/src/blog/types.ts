import type { SiteSettings } from '../types.js';
import type { SeoMetadata, LanguageAlternative } from '../page/index.js';

export interface BlogPostAuthor {
  id: number;
  display_name?: string;
  username: string;
  image?: string;
}

export interface BlogPostListItem {
  id: number;
  title: string;
  slug: string;
  excerpt?: string;
  featured_image_id?: number;
  featured_image_name?: string;
  featured_image_version_name?: string | null;
  publish_date?: string;
  author?: BlogPostAuthor;
  lang: string;
}

export interface BlogListData {
  lang: string;
  public_settings: SiteSettings;
  blog_posts: BlogPostListItem[];
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

export interface BlogPostData {
  id?: number;
  title?: string;
  content?: string;
  lang?: string;
  public_settings: SiteSettings;
  seo_metadata?: SeoMetadata;
  custom_code?: string | null;
  page_custom_code?: string | null;
  require_login?: boolean | null;
  featured_image_id?: number | null;
  featured_image_name?: string | null;
  featured_image_version_name?: string | null;
  publish_date?: string | null;
  author?: BlogPostAuthor | null;
  language_alternatives?: LanguageAlternative[];
  // added client-side when 404 is received
  notFound?: boolean;
  // added client-side when the post requires login and no session was present
  requiresLogin?: boolean;
}
