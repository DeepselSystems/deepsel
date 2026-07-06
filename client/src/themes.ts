// THEME_IMPORTS_START (auto-managed)
import Paper404 from "../../themes/paper/404.astro";
import PaperBlog from "../../themes/paper/blog.astro";
import PaperFormstatistics from "../../themes/paper/form-statistics.astro";
import PaperForm from "../../themes/paper/form.astro";
import PaperPage from "../../themes/paper/page.astro";
import PaperSearch from "../../themes/paper/search.astro";
import PaperSingleblog from "../../themes/paper/single-blog.astro";
// THEME_IMPORTS_END

export const themeSystemKeys = {
  Home: 'index',
  Page: 'page',
  BlogList: 'blog',
  BlogPost: 'single-blog',
  SearchResults: 'search',
  NotFound: '404',
  Form: 'form',
  FormStatistics: 'form-statistics',
};

// THEME_MAP_START (auto-managed)
export const themeMap = {
  'paper': {
    [themeSystemKeys.NotFound]: Paper404,
    [themeSystemKeys.BlogList]: PaperBlog,
    'form-statistics': PaperFormstatistics,
    'form': PaperForm,
    [themeSystemKeys.Page]: PaperPage,
    [themeSystemKeys.SearchResults]: PaperSearch,
    [themeSystemKeys.BlogPost]: PaperSingleblog,
  },
};
// THEME_MAP_END

export type ThemeName = keyof typeof themeMap;
