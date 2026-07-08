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
