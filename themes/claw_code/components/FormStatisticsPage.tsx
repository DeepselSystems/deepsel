import { MantineProvider, Text } from "@mantine/core";
import { WebsiteDataProvider, FormStatisticsFields } from "@deepsel/cms-react";
import { WebsiteDataTypes, type FormStatisticsData } from "@deepsel/cms-utils";
import Menu from "./Menu";

/**
 * Public form statistics page for claw_code theme.
 * Renders title, description, overview cards, then delegates per-field charts to FormStatisticsFields.
 */
export default function FormStatisticsPage({
  data,
}: {
  data: FormStatisticsData;
}) {
  if (!data || data.notFound) {
    return (
      <MantineProvider>
        <main className="min-h-screen flex flex-col">
          <Menu />
          <div className="flex flex-col items-center justify-center flex-1 text-center gap-4 px-4">
            <h1 className="text-4xl font-bold">404</h1>
            <p className="text-gray-400">Statistics not available for this form.</p>
            <a href="/" className="text-green-400 underline">Go home</a>
          </div>
        </main>
      </MantineProvider>
    );
  }

  return (
    <MantineProvider>
      <WebsiteDataProvider
        websiteData={{ type: WebsiteDataTypes.FormStatistics, data }}
      >
        <main className="min-h-screen flex flex-col">
          <Menu />

          <div className="flex-1 container px-3 xl:px-6 mx-auto max-w-xl xl:max-w-2xl 2xl:max-w-3xl space-y-6 py-10 xl:py-20">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">Form Statistics</h1>
              <p className="text-sm text-gray-400">
                View detailed statistics and analytics for form submissions
              </p>
            </div>

            <hr className="border-gray-700" />

            <div className="space-y-2 text-center pt-4">
              <h2 className="text-xl font-bold break-words">{data.title}</h2>
              {data.description && (
                <p className="text-sm text-gray-400">{data.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-800 rounded-lg p-4 space-y-2 text-center">
                <p className="font-bold text-gray-400 text-sm">Number of views</p>
                <Text size="xl" fw={700}>
                  {data.views_count ?? 0}
                </Text>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 space-y-2 text-center">
                <p className="font-bold text-gray-400 text-sm">Number of submissions</p>
                <Text size="xl" fw={700}>
                  {data.submissions_count ?? 0}
                </Text>
              </div>
            </div>

            <FormStatisticsFields
              fields={data.fields}
              submissions={data.submissions}
            />
          </div>
        </main>
      </WebsiteDataProvider>
    </MantineProvider>
  );
}
