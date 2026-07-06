import { WebsiteDataProvider, useWebsiteData } from "@deepsel/cms-react";
import { WebsiteDataTypes, getAttachmentByNameRelativeUrl } from "@deepsel/cms-utils";
import type { BlogPostData } from "@deepsel/cms-utils";
import { ArrowLeft, Calendar } from "./Icons";
import Menu from "./Menu";

export default function BlogPost({ data }: { data: BlogPostData }) {
  return (
    <WebsiteDataProvider websiteData={{ type: WebsiteDataTypes.BlogPost, data }}>
      <BlogPostContent />
    </WebsiteDataProvider>
  );
}

function BlogPostContent() {
  const { websiteData } = useWebsiteData();
  const post = websiteData.data as BlogPostData;
  const heroImage = post?.featured_image_name
    ? getAttachmentByNameRelativeUrl(post.featured_image_name, post.lang)
    : null;

  return (
    <>
      <Menu />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
        {/* Back */}
        <a
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-ink-500 hover:text-claw-400 transition-colors mb-8 font-mono"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to blog
        </a>

        {/* Hero image */}
        {heroImage && (
          <div className="rounded-xl overflow-hidden mb-8 border border-ink-800 h-64 sm:h-80">
            <img
              src={heroImage}
              alt={post?.title || ""}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Meta */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-ink-50 leading-tight mb-5">
            {post?.title}
          </h1>

          <div className="flex flex-wrap items-center gap-5 text-sm text-ink-500 pb-6 border-b border-ink-800">
            {post?.author && (
              <span className="flex items-center gap-2">
                {post.author.image ? (
                  <img
                    src={getAttachmentByNameRelativeUrl(post.author.image)}
                    alt={post.author.display_name || post.author.username || "Author"}
                    className="w-7 h-7 rounded-full"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-claw-400 to-claw-600 flex items-center justify-center text-white text-xs font-bold">
                    {(post.author.display_name || post.author.username || "?")[0]}
                  </div>
                )}
                {post.author.display_name || post.author.username || "Author"}
              </span>
            )}
            {post?.publish_date && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {new Date(post.publish_date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <article
          className="prose-custom mb-12"
          dangerouslySetInnerHTML={{ __html: post?.content || "" }}
        />
      </div>
    </>
  );
}
