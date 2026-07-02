import type { MenuItem } from './menus/index.js';
import type { SpecialTemplate } from './page/index.js';
import type { WebsiteDataType } from './constants/index.js';
import type { PageData, SearchResultsData } from './page/index.js';
import type { BlogListData, BlogPostData } from './blog/index.js';
import type { FormData } from './form/index.js';

export type WebsiteData = {
  type: WebsiteDataType;
  data: PageData | BlogListData | BlogPostData | SearchResultsData | FormData;
  settings?: SiteSettings;
  pathname?: string;
};

export interface SiteSettings {
  id: number;
  name: string;
  domains: string[];
  available_languages: Array<{
    id: number;
    name: string;
    iso_code: string;
    emoji_flag: string;
  }>;
  default_language: {
    id: number;
    name: string;
    iso_code: string;
    emoji_flag: string;
  };
  auto_translate_pages: boolean;
  auto_translate_posts: boolean;
  has_openrouter_api_key: boolean;
  ai_autocomplete_model_id: number;
  show_post_author: boolean;
  show_post_date: boolean;
  show_chatbox: boolean;
  website_custom_code: string | null;
  menus: MenuItem[];
  access_token_expire_minutes: number;
  require_2fa_all_users: boolean;
  allow_public_signup: boolean;
  is_enabled_saml: boolean;
  is_enabled_oidc: boolean;
  saml_sp_entity_id: string | null;
  auto_translate_components: boolean;
  has_openai_api_key: boolean;
  ai_default_writing_model_id: number;
  special_templates: Record<string, SpecialTemplate>;
  selected_theme: string;
}
