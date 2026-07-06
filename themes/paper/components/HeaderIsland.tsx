import { WebsiteDataTypes } from "@deepsel/cms-utils";
import { WebsiteDataProvider } from "@deepsel/cms-react";
import Header from "./Header";

/**
 * React island wrapping Header in a WebsiteDataProvider so it can read
 * menus, site settings, and language from context. Works for any template:
 * pass the template's data and its WebsiteDataTypes value.
 */
export default function HeaderIsland({
  data,
  type = WebsiteDataTypes.Page,
}: {
  data: any;
  type?: (typeof WebsiteDataTypes)[keyof typeof WebsiteDataTypes];
}) {
  return (
    <WebsiteDataProvider websiteData={{ type, data }}>
      <Header />
    </WebsiteDataProvider>
  );
}
