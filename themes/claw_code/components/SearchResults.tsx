import { useState } from "react";
import { WebsiteDataProvider } from "@deepsel/cms-react";
import { WebsiteDataTypes } from "@deepsel/cms-utils";
import type { SearchResultsData, SearchResultItem, PageData } from "@deepsel/cms-utils";
import { Search as SearchIcon, Clock, X } from "./Icons";
import Menu from "./Menu";

function ResultCard({ result }: { result: SearchResultItem }) {
  return (
    <article className="group flex gap-4 p-5 bg-ink-900 border border-ink-800 rounded-xl hover:border-ink-700 transition-all animate-slide-up">
      <div className="flex flex-col min-w-0">
        <h3 className="font-semibold text-ink-100 group-hover:text-claw-400 transition-colors mb-1.5 line-clamp-1">
          <a href={result.url}>{result.title}</a>
        </h3>
        {result.contentType && (
          <span className="text-xs font-mono text-claw-400 mb-1.5">{result.contentType}</span>
        )}
        <div className="flex items-center gap-3 mt-2 text-xs text-ink-600">
          {result.publishDate && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(result.publishDate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export default function SearchResults({ data }: { data: SearchResultsData }) {
  const pageData: PageData = { public_settings: data.public_settings, lang: data.lang };

  return (
    <WebsiteDataProvider websiteData={{ type: WebsiteDataTypes.Page, data: pageData }}>
      <SearchContent data={data} />
    </WebsiteDataProvider>
  );
}

function SearchContent({ data }: { data: SearchResultsData }) {
  const [query, setQuery] = useState(data.query || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      window.location.href = `/search?q=${encodeURIComponent(q)}`;
    }
  };

  const handleClear = () => {
    setQuery("");
    window.location.href = "/search";
  };

  return (
    <>
      <Menu />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 animate-fade-in">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-mono text-claw-500 mb-2">// search</p>
          <h1 className="text-4xl font-bold text-ink-50 mb-3">Search</h1>
          <p className="text-ink-500 text-sm">
            Search across all posts by title, category, author, or tag.
          </p>
        </div>

        {/* Search input */}
        <form onSubmit={handleSubmit} className="mb-10">
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search posts..."
              autoFocus
              className="w-full pl-12 pr-24 py-3.5 bg-ink-900 border border-ink-700 rounded-xl text-ink-100 placeholder-ink-600 focus:outline-none focus:border-claw-500 focus:ring-2 focus:ring-claw-500/20 transition-all text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-16 top-1/2 -translate-y-1/2 p-1 text-ink-500 hover:text-ink-300 transition-colors"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-claw-500 hover:bg-claw-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Go
            </button>
          </div>
        </form>

        {/* Results */}
        {data.query ? (
          <>
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-ink-500 font-mono">
                {data.total === 0
                  ? `No results for "${data.query}"`
                  : `${data.total} result${data.total !== 1 ? "s" : ""} for "${data.query}"`}
              </p>
              {data.total > 0 && (
                <button
                  onClick={handleClear}
                  className="text-xs text-ink-600 hover:text-ink-400 transition-colors font-mono"
                >
                  Clear
                </button>
              )}
            </div>

            {data.results?.length > 0 ? (
              <div className="space-y-4">
                {data.results.map((result) => (
                  <ResultCard key={result.id} result={result} />
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-ink-900 border border-ink-800 rounded-xl">
                <SearchIcon className="w-10 h-10 text-ink-700 mx-auto mb-4" />
                <p className="text-ink-500 mb-1">No posts found</p>
                <p className="text-xs text-ink-600 font-mono">
                  Try a different keyword or browse the{" "}
                  <a href="/blog" className="text-claw-500 hover:text-claw-400">
                    blog
                  </a>
                  .
                </p>
              </div>
            )}
          </>
        ) : (
          /* Suggestions when no query */
          data.suggestions?.length > 0 && (
            <div>
              <p className="text-xs font-mono text-ink-500 mb-4">Suggestions</p>
              <div className="flex flex-wrap gap-2">
                {data.suggestions.map((term) => (
                  <a
                    key={term}
                    href={`/search?q=${encodeURIComponent(term)}`}
                    className="px-3 py-1.5 text-xs font-mono bg-ink-900 border border-ink-700 text-ink-400 hover:border-claw-500/40 hover:text-claw-400 rounded-md transition-colors"
                  >
                    {term}
                  </a>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </>
  );
}
