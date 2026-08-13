---
name: theme-development
description: Create or modify a theme. Use when asked to create a new theme, add theme pages/components, modify theme templates, or get guidance on theme structure. Does NOT require Figma - for Figma-based themes use figma-to-theme instead.
argument-hint: <theme-name>
---

# Theme Development

Create or modify Astro-based CMS themes. This skill covers theme structure, templates, components, custom pages, and multi-language support.

## Arguments

- `$0` — Theme name in snake_case (e.g., `my_theme`)

If no argument provided, ask the user what theme they want to create or modify.

## When to Use

- User wants to create a new theme from scratch (no Figma)
- User wants to add a page, component, or template to an existing theme
- User asks about theme structure, data types, or conventions
- User wants to understand how themes work

For Figma-based theme creation, use `/figma-to-theme` instead.

## Overview

Themes are Astro-based template packages that control how the public website renders. Each theme lives in `themes/{theme_name}/` and is automatically discovered and registered by the CMS.

Astro is framework-agnostic — theme developers can use React, Vue, Svelte, Angular, Solid, or plain HTML/CSS/JS. `.astro` files handle the page shell (HTML document, head, meta tags), while interactive components use any framework via Astro's integration system. Components hydrate on the client via directives like `client:load`.

## Fast Start: Copy From a Reference Theme

**Do not design a theme's file set from scratch.** Two working reference themes live in `themes/` — read one and mirror its conventions:

- **`themes/claw_code`** — astro-first: templates are server-rendered HTML with `set:html` content and a single React island for the header. Best starting point for minimal-JS themes.


Copy `tsconfig.json`, `env.d.ts`, `i18n.ts`, and the `tailwind.config.js` shape verbatim from a reference theme; copy `components/Form.tsx` and `components/FormStatisticsPage.tsx` and restyle them (their submission/statistics logic is nontrivial — file uploads, view counting, submission limits — and should not be rewritten). Copy dependency **versions** from a reference theme's `package.json`, not from this document.

## Theme Structure

```
themes/{theme_name}/
├── theme.json             # Metadata: name, description, preview image
├── package.json           # Dependencies (React, UI libs, etc.)
├── preview.jpg            # Screenshot shown in the admin Themes page (required by theme.json)
├── tailwind.config.js     # Theme Tailwind preset (content globs + design tokens)
├── tsconfig.json          # extends astro/tsconfigs/strict, jsx react-jsx
├── env.d.ts               # astro/client types + image module declarations
├── i18n.ts                # i18next init (needed by Form.tsx)
├── page.astro             # Page template, renders CMS page from backend data (required)
├── 404.astro              # Not found template (required)
├── Index.astro            # Home page (optional) — capital I, see note below
├── blog.astro             # Blog listing (optional)
├── single-blog.astro      # Individual blog post (optional)
├── search.astro           # Search results (optional)
├── form.astro             # Public form page (include it — form URLs 404 without it)
├── form-statistics.astro  # Public form statistics page
├── my-page.astro          # Custom page (optional, file name is page slug)
├── components/            # React/Astro components
├── assets/                # CSS, images, fonts
└── main.css               # Global styles (if using Tailwind, etc.)
```

Every template must set `data-theme="{theme_name}"` on the `<html>` element — the backend rewrites this attribute for per-organization theme overlays and PostCSS uses it for per-theme CSS scoping.

**The home template is `Index.astro` — capital I.** `slug_to_theme_filename("/")` returns exactly
that. Some lookups lowercase the filename first, so `index.astro` appears to work until something
reads the file by name (theme file editor, page-slug listing).

## Per-Theme CSS Scoping

`client/postcss.config.js` runs `postcss-prefix-selector` **after** Tailwind, rewriting every
selector emitted from `themes/<name>/**`: `section` → `[data-theme="name"] section`, `:root` and
`html` → `html[data-theme="name"]`, `body` → `[data-theme="name"] body`.

**So you can paste a raw HTML mockup's entire `<style>` block into `main.css` verbatim** — bare
element selectors, `*` resets, generic class names — with zero leakage into the admin UI or another
theme. Porting a mockup is a copy/paste, not a rewrite. Don't hand-namespace selectors; the build
already did it.

Each theme's `tailwind.config.js` loads in a nested pass keyed off the same path, so a theme emits
only its own utilities and preflight. `themes/org_<id>/<theme>/` (optionally with a `<lang>` segment
before `<theme>`) is a per-organization overlay and resolves to the key `<theme>__<id>`, which
selects an overlay-specific `tailwind.config.js`.

## Step-by-Step: Creating a New Theme

### Step 1: Create Theme Directory and Metadata

#### theme.json

```json
{
  "name": "My Theme",
  "description": "A brief description of the theme.",
  "image": "preview.jpg"
}
```

The `image` field points to a preview screenshot shown in the admin dashboard. To produce `preview.jpg` without a running site: write a small static HTML mock of the theme's homepage (inline its fonts/colors), serve it locally (`python3 -m http.server` — the Playwright MCP blocks `file://` URLs), and screenshot it at 1200×800 with Playwright as JPEG.

#### Boilerplate: tailwind.config.js, tsconfig.json, env.d.ts, i18n.ts

Copy these four from a reference theme. `tailwind.config.js` must scope its `content` globs to the theme directory (via `fileURLToPath(import.meta.url)`) and exclude `node_modules`; it becomes a preset in the auto-generated client Tailwind config. Define colors as CSS variables (`var(--color-...)`) declared in `main.css` so users can retint the theme from the file editor.

#### package.json

Shared dependencies (`react`, `react-dom`) go in `peerDependencies`. Theme-specific dependencies go in `dependencies`. **Copy the current versions from a reference theme's `package.json`** — the ones below drift out of date. Shape:

```json
{
  "name": "@themes/<theme-name>",
  "version": "0.0.1",
  "type": "module",
  "peerDependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.3",
    "tailwindcss": "^3.4.18"
  },
  "dependencies": {
    "@deepsel/cms-react": "^2.2.7",
    "@deepsel/cms-utils": "^1.9.13",
    "@mantine/charts": "^8.3.12",
    "@mantine/core": "^8.3.12",
    "@mantine/hooks": "^8.3.12",
    "react-i18next": "^13.5.0"
  }
}
```

`@mantine/*` and `react-i18next` are needed by the form templates (`FormRenderer` requires a `MantineProvider`; `FormStatisticsFields` uses charts). If you drop the form templates you can drop these.

Themes are **not** npm workspaces — do not add them to the root `package.json`. When a theme is selected, the backend (`deepsel/apps/cms/utils/setup_themes.py`) assembles the client + theme into a data dir and runs `npm install` there automatically. In local dev, deps also resolve from the repo-root hoisted `node_modules`, so `npm install` from the repo root is enough to work on a theme.

### Step 2: Create Template Files

Every `.astro` template receives a `data` prop with the appropriate type. Write the page layout in HTML/Astro and use React components only where interactivity is needed (e.g., navigation menus with dropdowns). This keeps pages fast by shipping minimal JavaScript.

Here's the basic pattern — the page is HTML, with a React "island" for the interactive header menu:

**MenuIsland.tsx** — A small React wrapper that provides CMS context to the menu:

```tsx
import { WebsiteDataTypes, type PageData } from "@deepsel/cms-utils";
import { WebsiteDataProvider } from "@deepsel/cms-react";
import Menu from "./Menu";

export default function MenuIsland({ pageData }: { pageData: PageData }) {
  return (
    <WebsiteDataProvider websiteData={{ type: WebsiteDataTypes.Page, data: pageData }}>
      <Menu />
    </WebsiteDataProvider>
  );
}
```

**page.astro** — The template itself is mostly HTML, with `MenuIsland` as the only React island:

```astro
---
import type { PageData } from "@deepsel/cms-utils";
import MenuIsland from "./components/MenuIsland";
import Footer from "./components/Footer.astro";
import "@deepsel/cms-utils/styles.css";
import "./main.css";

interface Props {
    data: PageData;
}

const { data } = Astro.props;

// og:image requires an absolute URL; featured_image_version_name is the SEO-friendly storage key
import { getAttachmentRelativeUrl } from "@deepsel/cms-utils";
const ogImageUrl = data.seo_metadata?.featured_image_version_name
  ? new URL(getAttachmentRelativeUrl(data.seo_metadata.featured_image_version_name), Astro.url).href
  : null;
---

<!DOCTYPE html>
<html lang={data.lang || 'en'} data-theme="my_theme">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>{data.seo_metadata?.title || ''}</title>
    <meta name="description" content={data.seo_metadata?.description || ''} />
    <meta name="robots" content={data.seo_metadata?.allow_indexing ? 'index, follow' : 'noindex, nofollow'} />
    {ogImageUrl && <meta property="og:image" content={ogImageUrl} />}
    <meta property="og:title" content={data.seo_metadata?.title || ''} />
    <meta property="og:description" content={data.seo_metadata?.description || ''} />
    <meta property="og:type" content="website" />
</head>
<body>
    <MenuIsland client:load pageData={data} />
    <main>
        <article class="page-content" set:html={data.content} />
    </main>
    <footer><!-- Footer content --></footer>
</body>
</html>
```

Use `client:load` on React components that need interactivity (like menus). Static parts like footers can be plain Astro components or HTML. `blog.astro` and `search.astro` can be fully server-rendered the same way: loop over `data.blog_posts` / `data.results` in the Astro template and emit plain links — no React needed (see `themes/paper/blog.astro`).

Add this to `main.css` so island wrappers don't break flex/grid layouts:

```css
astro-island {
  display: contents;
}
```

#### Why the island wrapper?

Each `client:load` component becomes an **isolated React tree** — there is no shared React context between islands. If `Menu` uses `useWebsiteData()`, it needs a `WebsiteDataProvider` above it in the tree. But the `.astro` file is server-rendered HTML, not a React tree, so it can't provide that context. The island wrapper puts the provider and the component in the same React tree:

```
Astro (static HTML)
  └── MenuIsland (client:load → React island boundary)
        └── WebsiteDataProvider (React context)
              └── Menu (can now call useWebsiteData())
```

Alternatively, a component can set up its own provider internally — no separate wrapper needed. Both approaches work; the wrapper just keeps context plumbing separate from component logic.

### Step 3: Implement Components

#### Content Styles

Templates that render CMS editor content (pages, blog posts) should import the shared content styles from `@deepsel/cms-utils`. These styles handle editor-generated elements like collapsible sections, embedded files/video/audio, code blocks, and more:

```astro
---
import "@deepsel/cms-utils/styles.css";
import "./main.css";
---
```

Import `@deepsel/cms-utils/styles.css` **before** your theme's own CSS so theme styles can override if needed.

### Step 4: Theme Registration (Automatic)

`client/src/themes.ts` and `client/tailwind.config.js` are **fully auto-generated** by the backend — do not edit them manually. The backend scans `themes/` on startup and regenerates these files to import only the currently selected theme.

When a theme is selected via the admin or `/theme/select` API:
- `themes.ts` is regenerated with imports and `themeMap` for just that theme
- `tailwind.config.js` is regenerated with only that theme's Tailwind preset
- In production, the client is rebuilt and restarted automatically
- In dev mode (`NO_CLIENT=true`), files are regenerated locally and Astro HMR picks up changes

**No manual registration step is needed** — just create your theme files and select the theme.

### Step 5: Activate and Test

Select the theme via the admin Themes page, or via the API:

```bash
# Token endpoint is form-encoded, not JSON
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/token \
  -d 'username=admin&password=1234' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -s http://localhost:8000/api/v1/theme/list -H "Authorization: Bearer $TOKEN"   # /api/v1/theme alone is a 404

curl -X POST http://localhost:8000/api/v1/theme/select \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"folder_name": "<theme-name>"}'
```

Then start the dev server if not already running:

```bash
npm install  # from repo root
npm run dev
```

## Special Templates Reference

The CMS recognizes these special template files. Each maps to a URL pattern and receives typed data.

### Index.astro — Home Page

**URL:** `/` or `/{lang}/`
**Data type:** `PageData`

Renders the home page. Overrides any CMS-defined home page. The capital `I` is required — see
[Theme Structure](#theme-structure).

### page.astro — Generic Page

**URL:** `/{slug}` or `/{lang}/{slug}`
**Data type:** `PageData`

Main workhorse template. CMS pages (e.g., `/about`, `/contact`) render through this. `PageData.content` contains rich text from the TipTap editor.

This template is a styling wrapper — it provides site layout (header, footer, sidebar) while actual content comes from the CMS database.

### blog.astro — Blog Listing

**URL:** `/blog`, `/blog/page/{n}` or `/{lang}/blog`
**Data type:** `BlogListData`

Receives a paginated list of blog posts. `BlogListData` includes `blog_posts`, `page`, `page_size`, `total_count`, `total_pages`.

### single-blog.astro — Blog Post

**URL:** `/blog/{slug}` or `/{lang}/blog/{slug}`
**Data type:** `BlogPostData`

Individual blog post. `BlogPostData` includes `title`, `content` (HTML string), `author`, `featured_image_id`, `publish_date`, and more.

### search.astro — Search Results

**URL:** `/search?q={query}` or `/{lang}/search?q={query}`
**Data type:** `SearchResultsData`

`SearchResultsData` includes `query`, `results` (array of `SearchResultItem`), `total`, `suggestions`.

### 404.astro — Not Found

**Data type:** `PageData` (with `notFound: true`)

The `PageData` still includes `public_settings` for site-wide config access.

### form.astro — Public Form

**URL:** `/forms/{slug}` or `/{lang}/forms/{slug}`
**Data type:** `FormData` (may have `notFound: true`)

Renders a public form. Port `components/Form.tsx` from a reference theme rather than rewriting it — it handles `FormRenderer` wiring, prefill, file-upload fields, the view counter, submission limits, and `CustomCodeRenderer`. Requires `MantineProvider`, the theme's `i18n.ts`, and these imports in the template:

```astro
import "@mantine/core/styles.css";
import "@deepsel/cms-react/styles/form.css";
```

### form-statistics.astro — Public Form Statistics

**URL:** `/forms/{slug}/statistics` (when the form enables public statistics)
**Data type:** `FormStatisticsData`

Port `components/FormStatisticsPage.tsx` from a reference theme; per-field charts come from `FormStatisticsFields` (cms-react). Also needs `@mantine/charts/styles.css` and `@deepsel/cms-react/styles/form-statistics.css`.

## Custom Pages

Any `.astro` file that isn't a special template becomes a **custom page** with its own URL route. Filename (without `.astro`) becomes the URL path.

| File                    | URL                              |
|-------------------------|----------------------------------|
| `contact.astro`         | `/contact` or `/{lang}/contact`  |
| `pricing.astro`         | `/pricing` or `/{lang}/pricing`  |
| `my-custom-page.astro`  | `/my-custom-page`                |

Custom page contents are **static** — they don't fetch content from the CMS backend. They receive a minimal `PageData` with `slug`, `public_settings`, and an auto-generated `seo_metadata.title` derived from the filename.

Useful for pages with fully custom layouts that don't need the CMS editor (landing pages, contact forms, etc.).

## Language Variants

Language-specific template variants live in per-language subfolders **inside** the theme, `themes/{theme_name}/{lang_code}/` (folder names are locale `iso_code`s like `de`, `en`):

```
themes/
└── my_theme/
    ├── Index.astro        # Optional fallback for langs without their own file
    ├── page.astro
    ├── contact.astro
    ├── de/
    │   ├── index.astro    # Serves `/` when German is the default language
    │   └── contact.astro  # Serves `/de/contact`
    └── en/
        └── index.astro    # Serves `/en/`
```

Resolution tries the language-prefixed variant first — **including for the site's default language** — then the theme-root file, then the generic fallback. E.g. with German as default, `/` renders `my_theme/de/index.astro` if it exists, else `my_theme/Index.astro`; `/en/contact` renders `my_theme/en/contact.astro`, else `my_theme/contact.astro`.

Keep a theme-root file as a fallback for languages that have no dedicated file (and so `Index.astro`'s `/` route stays visible to the page-slug conflict check).

Files one level deeper need their relative imports adjusted (`./components/X` → `../components/X`).

In the admin theme editor, "Add Language Version" creates a new `{lang}/{path}` file (stored as an org-scoped DB edit and reconciled to disk); DB-only files can be deleted from the editor. Legacy per-content `lang_code` versions were migrated to these lang-prefixed paths in app version 1.0.13.

### Inline Translations for Hardcoded Pages

For hardcoded landing pages, pair the per-language files with a shared component plus a translations object, so markup stays in one place (thin `de/index.astro`-style wrappers importing a shared `components/LandingPage.astro` and passing `lang` and `t`):

```ts
// translations.ts
const translations = {
  de: { hero: { h1: "...", lead: "..." }, services: { items: [...] }, ... },
  en: { hero: { h1: "...", lead: "..." }, services: { items: [...] }, ... },
} as const;
export default translations;
```

```astro
---
import translations from "./translations";
const lang = data.lang || "de";
const t = translations[lang as keyof typeof translations] || translations.de;
---
<h1>{t.hero.h1}</h1>
```

The translations object runs in Astro frontmatter (SSR, zero client JS). Separate translatable text from structural data (images, URLs) — put structural data in the template, text in `translations.ts`. JSON-LD structured data and SEO metadata should also read from `t`.

## Available Data Types

### PageData

```typescript
interface PageData {
  id?: number;
  title?: string;
  content?: Content;              // TipTap editor content
  slug?: string;
  lang?: string;
  public_settings: SiteSettings;  // Site-wide settings
  seo_metadata?: SeoMetadata;     // title, description, allow_indexing, featured_image
  language_alternatives?: LanguageAlternative[];
  page_custom_code?: string;      // Custom HTML/JS injected per-page
  custom_code?: string;           // Global custom code
  require_login?: boolean;
  notFound?: boolean;
}
```

### BlogListData

```typescript
interface BlogListData {
  lang: string;
  public_settings: SiteSettings;
  blog_posts: BlogPostListItem[];  // id, title, slug, excerpt, featured_image, publish_date, author
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}
```

### BlogPostData

```typescript
interface BlogPostData {
  id?: number;
  title?: string;
  content?: string;               // HTML content
  lang?: string;
  public_settings: SiteSettings;
  seo_metadata?: SeoMetadata;
  featured_image_id?: number;
  featured_image_name?: string;
  publish_date?: string;
  author?: BlogPostAuthor;        // id, username, display_name, image
  language_alternatives?: LanguageAlternative[];
  notFound?: boolean;
}
```

### SearchResultsData

```typescript
interface SearchResultsData {
  lang: string;
  query: string;
  public_settings: SiteSettings;
  results: SearchResultItem[];    // id, title, url, publishDate, contentType, relevanceScore
  total: number;
  suggestions: string[];
}
```

## Key Packages

- **`@deepsel/cms-utils`** — Data types (`PageData`, `BlogListData`, etc.), fetch utilities, and helpers:
  - `getAttachmentByNameRelativeUrl(name, lang?)` — URL for a stored attachment (featured images, author avatars)
  - `getAttachmentRelativeUrl(versionName)` — URL from `seo_metadata.featured_image_version_name` (for og:image)
  - `isActiveMenu(menuItem, websiteData)` — whether a menu item matches the current page
  - `WebsiteDataTypes` — a **const object, not a TS enum**; as a type annotation use `(typeof WebsiteDataTypes)[keyof typeof WebsiteDataTypes]`
- **`@deepsel/cms-react`** — React components and hooks:
  - `WebsiteDataProvider` / `useWebsiteData()` — Context for page data
  - `useLanguage` — Language switching utilities (`{ language, setLanguage, availableLanguages }`)
  - `useAuthentication` — Auth state for preview mode
  - `PageTransition` — Page transition animations
  - `FormRenderer`, `FormStatisticsFields`, `CustomCodeRenderer` — used by the form templates

## Common Recipes

- **Menus and site name** come from context inside an island: `websiteData.settings.menus` (array of `MenuItem` with `children`, `open_in_new_tab`) and `websiteData.settings.name`.
- **Language URL prefix** — non-default languages are served under `/{lang}/...`, so prefix internal links:

  ```ts
  const defaultLang = data.public_settings?.default_language?.iso_code;
  const langPrefix = data.lang && defaultLang && data.lang !== defaultLang ? `/${data.lang}` : "";
  ```

- **Blog links** — `post.slug` already includes a leading slash: link to `` `${langPrefix}/blog${post.slug}` ``. Pagination pages are `` `${langPrefix}/blog/page/${n}` `` (page 1 is `/blog`).
- **No-JS search box** — a plain HTML form works without any React handler: `<form action={`${langPrefix}/search`} method="get"><input name="q" /></form>`.
- **A single generic header island** can serve every template — accept `data` plus a `type` prop (a `WebsiteDataTypes` value, serializable across the island boundary) and pass both to `WebsiteDataProvider`, rather than hardcoding `type: Page` like the `MenuIsland` example above. The shipped `themes/claude_code/components/MenuIsland.tsx` is that hardcoded example — generalize it yourself to reuse one island across templates.
- **Quick check** of a theme without running the app — `npm run build --workspace=client`. Catches
  bad imports and missing assets too. `npx tsc` does **not** work here: TypeScript isn't installed,
  and npx resolves to an unrelated binary ("This is not the tsc command you are looking for").

## Theme Seed Data

Themes can include a `data/` directory with CSV seed files and a `post_install` hook:

```
themes/{theme_name}/data/
├── __init__.py      # import_order list + optional post_install(db, organization_id)
└── menu.csv         # CSV files (same format as backend app data)
```

**A flat `import_order` is all you need — do not hand-roll a CSV importer.**
`load_seed_data_for_theme` calls `import_csv_data` per file with `auto_commit=True`, so each file
commits before the next runs and cross-file `table/column` FK references resolve with no manual
`db.flush()`. A theme needs its own importer only if it also imports images/attachments.

`__init__.py` defines `import_order` and optionally `post_install`:

```python
import_order = ["menu.csv"]

def post_install(db, organization_id):
    """Runs after CSV import. Receives a SQLAlchemy session and the org id."""
    from deepsel.apps.core.models.locale import LocaleModel
    from deepsel.apps.cms.models.organization import CMSSettingsModel

    locale = db.query(LocaleModel).filter(LocaleModel.string_id == "de_DE").first()
    if locale:
        for org in db.query(CMSSettingsModel).all():
            # NOTE: list(...) — see the mutation warning below
            available = list(org.available_languages or [])
            if not any(l.get("iso_code") == "de" for l in available):
                available.append({"id": locale.id, "name": locale.name, "iso_code": locale.iso_code})
                org.available_languages = available
            org.default_language_id = locale.id
        db.commit()
```

**Two arguments, not one.** A one-arg `def post_install(db)` raises `TypeError`, and the call site
logs every exception instead of re-raising — so the hook silently does nothing while theme selection
still reports success. Same for any error inside it; check the backend log if it seems not to run.

**Copy JSON columns before mutating.** SQLAlchemy doesn't track in-place mutation of a plain `JSON`
column, and reassigning the identical object never marks it dirty, so `available.append(...)` is
dropped on commit. `list(...)` first, as above.

Use `post_install` for setup logic that can't be expressed as CSV records, such as:

- Adding languages to the site's available languages list
- Setting the default site language
- Configuring theme-specific CMS settings
- Removing CMS demo menu entries that clash with the theme's own nav (see Gotchas)

### Loading Behavior

- Seed data is loaded by `load_seed_data_for_theme()` in `deepsel/apps/cms/utils/setup_themes.py`
- Runs **once when a theme is selected** — either via the `/theme/select` API or when `set_default_theme_if_empty()` assigns the initial theme on a fresh DB
- Does **not** run on every server restart — user edits (e.g., deleting a menu item) are preserved across restarts
- CSV records with `string_id` are checked for existence — existing records are updated, not duplicated

CSV format follows the same rules as backend app data — see the [data-insertion](../data-insertion/SKILL.md) skill, which also covers generating and managing CSV data, the seed-data iteration loop, and the columns available on `page_content` (including SEO metadata) and `form_content`.

## Gotchas

### `WebsiteDataProvider` overwrites the `<title>` your template rendered

`WebsiteDataContext` renders `<PageTransition />` internally, which assigns
`document.title = data.seo_metadata.title` on hydration (plus `meta[name=description]`,
`meta[name=robots]`, `html[lang]`).

So **any** island wrapped in `WebsiteDataProvider` — even a one-liner that just runs page custom
code — replaces the `<title>` your template server-rendered. For a hardcoded page whose SEO copy is
part of the design, setting `<head>` isn't enough; override `seo_metadata` in the island's data too:

```astro
const landingData = { ...data, seo_metadata: { ...data.seo_metadata, title: MY_TITLE } };
```

Symptom: `og:title` is right but `<title>` is the CMS's — `curl` shows the correct page, the browser
doesn't.

### CMS demo menu items collide with a theme's own nav

`deepsel/apps/cms/demo_data/menu.csv` seeds `Home`, `Welcome`, `Blog` on any fresh install. A theme
seeding a complete nav gets these interleaved by `position`, and `Blog` points at `/blog`, which
404s without a `blog.astro`. Either delete them in `post_install` or design the nav to tolerate them.

### A custom form UI must still send `field_snap_short`

Building your own form UI instead of `FormRenderer` means matching its `submission_data` shape:

```js
submission_data = {
  [field.id]: { field_id: field.id, field_snap_short: field, value: <answer> },
}
```

`field_snap_short` is the **whole** field object — it's what the admin submission viewer reads to
label each answer and what the statistics components filter on (`field_snap_short.field_type`). Omit
it and submissions save fine but show up as unlabelled bare values in the admin.
