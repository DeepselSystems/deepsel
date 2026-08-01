import type { SiteSettings } from '../types.js';
import type { MenuItem } from '../menus/index.js';

export interface Language {
  id: number;
  name: string;
  iso_code: string;
  svg_flag: string;
}

export interface SpecialTemplate {
  name: string;
  html?: string;
  component_name?: string;
}

export type Menus = MenuItem[];

export interface SeoMetadata {
  title: string;
  description: string | null;
  featured_image_id: number | null;
  featured_image_name: string | null;
  featured_image_version_name?: string | null;
  allow_indexing: boolean;
}

export interface LanguageAlternative {
  slug: string;
  locale: Language;
}

export interface PageData {
  id?: number;
  title?: string;
  content?: string;
  slug?: string;
  lang?: string;
  public_settings: SiteSettings;
  seo_metadata?: SeoMetadata;
  language_alternatives?: LanguageAlternative[];
  page_custom_code?: string | null;
  custom_code?: string | null;
  require_login?: boolean;
  // added client-side when 404 is received
  notFound?: boolean;
  // added client-side when the page requires login and no session was present
  requiresLogin?: boolean;
  // set by buildClientPageData for theme-defined pages (no DB content)
  clientPage?: boolean;
}
