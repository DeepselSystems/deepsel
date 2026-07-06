import { MantineProvider } from "@mantine/core";
import { WebsiteDataProvider, FormStatisticsFields } from "@deepsel/cms-react";
import { WebsiteDataTypes, type FormStatisticsData } from "@deepsel/cms-utils";
import Header from "./Header";

/**
 * Public form statistics page for the paper theme.
 * Renders title, description, overview figures, then delegates per-field charts to FormStatisticsFields.
 */
export default function FormStatisticsPage({
  data,
}: {
  data: FormStatisticsData;
}) {
  if (!data || data.notFound) {
    return (
      <MantineProvider>
        <div className="flex-1 max-w-measure w-full mx-auto px-5 py-24 flex flex-col items-center justify-center text-center">
          <p className="font-serif text-7xl mb-6">404</p>
          <p className="text-ink-soft mb-8">
            Statistics not available for this form.
          </p>
          <a href="/" className="text-sm underline underline-offset-4 hover:text-ink-soft">
            Go back home
          </a>
        </div>
      </MantineProvider>
    );
  }

  return (
    <MantineProvider>
      <WebsiteDataProvider
        websiteData={{ type: WebsiteDataTypes.FormStatistics, data }}
      >
        <Header />

        <div className="flex-1 max-w-measure w-full mx-auto px-5 py-12 space-y-8">
          <div>
            <h1 className="font-serif text-3xl mb-2">Form Statistics</h1>
            <p className="text-sm text-ink-faint">
              View detailed statistics and analytics for form submissions
            </p>
          </div>

          <hr className="border-line" />

          <div className="space-y-2">
            <h2 className="font-serif text-xl break-words">{data.title}</h2>
            {data.description && (
              <p className="text-sm text-ink-soft">{data.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-px bg-line border border-line">
            <div className="bg-paper p-5 text-center space-y-1">
              <p className="text-xs uppercase tracking-widest text-ink-faint">
                Views
              </p>
              <p className="font-serif text-3xl">{data.views_count ?? 0}</p>
            </div>
            <div className="bg-paper p-5 text-center space-y-1">
              <p className="text-xs uppercase tracking-widest text-ink-faint">
                Submissions
              </p>
              <p className="font-serif text-3xl">{data.submissions_count ?? 0}</p>
            </div>
          </div>

          <FormStatisticsFields
            fields={data.fields}
            submissions={data.submissions}
          />
        </div>
      </WebsiteDataProvider>
    </MantineProvider>
  );
}
