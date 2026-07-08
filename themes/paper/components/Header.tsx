import { useState } from "react";
import { useWebsiteData, useLanguage } from "@deepsel/cms-react";
import { isActiveMenu, type MenuItem } from "@deepsel/cms-utils";

function NavLink({ item, active }: { item: MenuItem; active: boolean }) {
  const hasChildren = !!item.children && item.children.length > 0;

  if (!hasChildren) {
    return (
      <a
        href={item.url || "#"}
        {...(item.open_in_new_tab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={`text-sm tracking-wide transition-colors ${
          active ? "text-ink" : "text-ink-soft hover:text-ink"
        }`}
      >
        {item.title}
      </a>
    );
  }

  return (
    <span className="relative group">
      <button
        type="button"
        className="text-sm tracking-wide text-ink-soft hover:text-ink transition-colors"
      >
        {item.title} <span className="text-ink-faint">&darr;</span>
      </button>
      <span className="absolute left-0 top-full hidden group-hover:block pt-2 z-20">
        <span className="flex flex-col min-w-[10rem] bg-paper border border-line py-2">
          {item.children?.map((child) => (
            <a
              key={child.id}
              href={child.url || "#"}
              {...(child.open_in_new_tab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="px-4 py-1.5 text-sm text-ink-soft hover:text-ink hover:bg-paper-soft"
            >
              {child.title}
            </a>
          ))}
        </span>
      </span>
    </span>
  );
}

function LangSwitcher() {
  const { language, setLanguage, availableLanguages } = useLanguage();

  if (!availableLanguages || availableLanguages.length <= 1) {
    return null;
  }

  return (
    <span className="relative group">
      <button
        type="button"
        className="text-xs uppercase tracking-widest text-ink-faint hover:text-ink transition-colors"
      >
        {language?.toUpperCase()}
      </button>
      <span className="absolute right-0 top-full hidden group-hover:block pt-2 z-20">
        <span className="flex flex-col min-w-[4rem] bg-paper border border-line py-1">
          {availableLanguages
            .filter((lang: any) => lang.iso_code !== language)
            .map((lang: any) => (
              <button
                key={lang.iso_code}
                type="button"
                onClick={() => setLanguage(lang.iso_code)}
                className="px-3 py-1 text-xs uppercase tracking-widest text-left text-ink-soft hover:text-ink hover:bg-paper-soft"
              >
                {lang.iso_code.toUpperCase()}
              </button>
            ))}
        </span>
      </span>
    </span>
  );
}

function SearchForm({ langPrefix }: { langPrefix: string }) {
  return (
    <form action={`${langPrefix}/search`} method="get" className="flex items-center">
      <input
        type="text"
        name="q"
        placeholder="Search&hellip;"
        className="w-24 focus:w-40 transition-all bg-transparent border-b border-line focus:border-ink text-sm py-0.5 placeholder-ink-faint focus:outline-none"
      />
    </form>
  );
}

export default function Header() {
  const { websiteData } = useWebsiteData();
  const [mobileOpen, setMobileOpen] = useState(false);

  const menus = websiteData?.settings?.menus || [];
  const siteName = websiteData?.settings?.name || "Paper";

  const currentLang = (websiteData?.data as any)?.lang;
  const defaultLang = websiteData?.data?.public_settings?.default_language?.iso_code;
  const langPrefix =
    currentLang && defaultLang && currentLang !== defaultLang ? `/${currentLang}` : "";

  return (
    <header className="border-b border-line">
      <nav className="max-w-measure mx-auto px-5 flex items-center justify-between h-16">
        <a href={langPrefix || "/"} className="font-serif text-xl text-ink no-underline">
          {siteName}
        </a>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-6">
          {menus.map((menu) => (
            <NavLink key={menu.id} item={menu} active={isActiveMenu(menu, websiteData!)} />
          ))}
          <SearchForm langPrefix={langPrefix} />
          <LangSwitcher />
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="sm:hidden text-sm text-ink-soft hover:text-ink"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? "Close" : "Menu"}
        </button>
      </nav>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-line px-5 py-4 flex flex-col gap-3 max-w-measure mx-auto">
          {menus.map((menu) => (
            <div key={menu.id} className="flex flex-col gap-2">
              <a
                href={menu.url || "#"}
                {...(menu.open_in_new_tab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="text-sm text-ink-soft hover:text-ink"
              >
                {menu.title}
              </a>
              {menu.children?.map((child) => (
                <a
                  key={child.id}
                  href={child.url || "#"}
                  className="text-sm text-ink-faint hover:text-ink pl-4"
                >
                  {child.title}
                </a>
              ))}
            </div>
          ))}
          <div className="flex items-center justify-between pt-2">
            <SearchForm langPrefix={langPrefix} />
            <LangSwitcher />
          </div>
        </div>
      )}
    </header>
  );
}
