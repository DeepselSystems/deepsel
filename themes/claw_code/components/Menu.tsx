import { useState } from "react";
import { useWebsiteData } from "@deepsel/cms-react";
import { isActiveMenu, type MenuItem } from "@deepsel/cms-utils";
import { Search, MenuIcon, X, Terminal } from "./Icons";

export const designMenuItems: MenuItem[] = [
  { id: 1, title: "Home", url: "/", children: [], position: 0, open_in_new_tab: false },
  { id: 2, title: "Blog", url: "/blog", children: [], position: 1, open_in_new_tab: false },
  { id: 3, title: "Search", url: "/search", children: [], position: 2, open_in_new_tab: false },
];

export default function Header() {
  const { websiteData } = useWebsiteData();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const menus = websiteData?.settings?.menus?.length
    ? websiteData.settings.menus
    : designMenuItems;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
      setSearchQuery("");
      setMobileMenuOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-ink-950/90 backdrop-blur-md border-b border-ink-800">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-claw-400 to-claw-600 flex items-center justify-center shadow-lg shadow-claw-600/20">
              <Terminal className="w-4 h-4 text-white" />
            </div>
            <span className="font-mono font-semibold text-ink-100 group-hover:text-claw-400 transition-colors">
              {websiteData?.settings?.name || "My Website"}
            </span>
          </a>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {menus.map((menu) => {
              const active = isActiveMenu(menu, websiteData);
              return (
                <a
                  key={menu.id}
                  href={menu.url || "#"}
                  {...(menu.open_in_new_tab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className={`text-sm font-medium transition-colors ${
                    active
                      ? "text-claw-400"
                      : "text-ink-400 hover:text-ink-100"
                  }`}
                >
                  {menu.title}
                </a>
              );
            })}

            {/* Inline search */}
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-500" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-36 pl-8 pr-3 py-1.5 text-sm bg-ink-900 border border-ink-700 rounded-md text-ink-200 placeholder-ink-600 focus:outline-none focus:border-claw-500 focus:ring-1 focus:ring-claw-500/30 transition-all focus:w-48"
              />
            </form>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-ink-400 hover:text-ink-100 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-ink-800 space-y-1 animate-fade-in">
            {menus.map((menu) => {
              const active = isActiveMenu(menu, websiteData);
              return (
                <a
                  key={menu.id}
                  href={menu.url || "#"}
                  {...(menu.open_in_new_tab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? "text-claw-400 bg-claw-500/10"
                      : "text-ink-400 hover:text-ink-100 hover:bg-ink-800"
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {menu.title}
                </a>
              );
            })}
            <form onSubmit={handleSearch} className="px-3 pt-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
                <input
                  type="text"
                  placeholder="Search posts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-ink-900 border border-ink-700 rounded-md text-ink-200 placeholder-ink-600 focus:outline-none focus:border-claw-500"
                />
              </div>
            </form>
          </div>
        )}
      </nav>
    </header>
  );
}
