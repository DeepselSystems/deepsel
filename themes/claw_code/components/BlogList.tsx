import { WebsiteDataProvider, useWebsiteData } from "@deepsel/cms-react";
import { WebsiteDataTypes, getAttachmentByNameRelativeUrl } from "@deepsel/cms-utils";
import type { BlogListData, BlogPostListItem } from "@deepsel/cms-utils";
import { User } from "./Icons";
import Menu from "./Menu";

function PostCard({ post }: { post: BlogPostListItem }) {
  const image = post.featured_image_name
    ? getAttachmentByNameRelativeUrl(post.featured_image_name, post.lang)
    : null;

  return (
    <article className="group flex flex-col sm:flex-row gap-5 bg-ink-900 border border-ink-800 rounded-xl p-5 hover:border-ink-700 transition-all duration-200 animate-slide-up">
      <div className="sm:w-48 sm:shrink-0 overflow-hidden rounded-lg h-36 sm:h-auto bg-ink-800">
        {image && (
          <img
            src={image}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        )}
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <h2 className="text-lg font-semibold text-ink-100 group-hover:text-claw-400 transition-colors mb-2 line-clamp-2">
          <a href={`/blog${post.slug}`}>{post.title}</a>
        </h2>
        {post.excerpt && (
          <p className="text-sm text-ink-500 line-clamp-2 flex-1 mb-4">{post.excerpt}</p>
        )}
        <div className="flex items-center gap-5 text-xs text-ink-600">
          {post.author && (
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              {post.author.display_name || post.author.username || "Author"}
            </span>
          )}
          {post.publish_date && (
            <span className="ml-auto">
              {new Date(post.publish_date).toLocaleDateString("en-US", {
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

export default function BlogList({ data }: { data: BlogListData }) {
  return (
    <WebsiteDataProvider websiteData={{ type: WebsiteDataTypes.BlogList, data }}>
      <BlogListContent />
    </WebsiteDataProvider>
  );
}

function BlogListContent() {
  const { websiteData } = useWebsiteData();
  const blogData = websiteData.data as BlogListData;
  const postCount = blogData?.total_count || blogData?.blog_posts?.length || 0;

  return (
    <>
      <Menu />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 animate-fade-in">
        {/* Header */}
        <div className="mb-10">
          <p className="text-xs font-mono text-claw-500 mb-2">// articles</p>
          <h1 className="text-4xl font-bold text-ink-50 mb-3">The Blog</h1>
          <p className="text-ink-500">
            Deep dives on engineering, techniques, and developer tools.
          </p>
        </div>

        {/* Post count */}
        <div className="flex items-center justify-end mb-6">
          <span className="text-xs text-ink-600 font-mono">
            {postCount} {postCount === 1 ? "post" : "posts"}
          </span>
        </div>

        {/* Post list */}
        {blogData?.blog_posts?.length === 0 ? (
          <div className="text-center py-20 text-ink-600 font-mono">
            No posts found.
          </div>
        ) : (
          <div className="space-y-5">
            {blogData?.blog_posts?.map((post: BlogPostListItem) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {blogData?.total_pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-10">
            {Array.from({ length: blogData.total_pages }, (_, i) => i + 1).map(
              (page) => (
                <a
                  key={page}
                  href={`/blog/page/${page}`}
                  className={`px-3 py-1.5 text-xs font-mono rounded-md border transition-colors ${
                    page === blogData.page
                      ? "bg-claw-500/20 border-claw-500/40 text-claw-400"
                      : "bg-ink-900 border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-200"
                  }`}
                >
                  {page}
                </a>
              )
            )}
          </div>
        )}
      </div>
    </>
  );
}
