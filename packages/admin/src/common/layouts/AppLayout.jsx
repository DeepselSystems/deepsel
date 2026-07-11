import { useDisclosure } from '@mantine/hooks';
import { AppShell, Burger } from '@mantine/core';
import { Link, Outlet } from 'react-router-dom';
import useAuthentication from '../api/useAuthentication.js';
import useUserPreferences from '../api/useUserPreferences.js';
import NavigationLinks from '../ui/AppLayout/NavigationLinks.jsx';
import AppsDropdown from '../ui/AppLayout/AppsDropdown.jsx';
import ProfileDropdown from '../ui/AppLayout/ProfileDropdown.jsx';
// import NotificationsDropdown from '../ui/AppLayout/NotificationsDropdown.jsx';
import Button from '../ui/Button.jsx';
import apps from '../../constants/apps.js';
import trackingSettings from '../../constants/trackingSettings.js';
import { useTranslation } from 'react-i18next';
import SidebarState from '../stores/SidebarState.js';
import ShowHeaderBackButtonState from '../stores/ShowHeaderBackButtonState.js';
import ShowSiteSelectorState from '../stores/ShowSiteSelectorState.js';
import GoToSiteLinkState from '../stores/GoToSiteLinkState.js';
import HideHeaderItemsState from '../stores/HideHeaderItemsState.js';
import useBack from '../hooks/useBack.js';
import SitePublicSettingsState from '../stores/SitePublicSettingsState.js';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import { useEffect, useMemo } from 'react';
// import LangSwitcher from '../ui/AppLayout/LangSwitcher.jsx';
import SiteSelector from '../ui/SiteSelector.jsx';
import OrganizationIdState from '../stores/OrganizationIdState.js';
import NavigationConfirmationState from '../stores/NavigationConfirmationState.js';
import VisibilityControl from '../auth/VisibilityControl.jsx';
import OrganizationState from '../stores/OrganizationState.js';
import { getOrganizationDomain } from '../../utils/domainUtils.js';
import { useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconArrowUpRight, IconUsers } from '@tabler/icons-react';

export default function AppLayout(props) {
  const {
    navbarLinks,
    navbarWidth = 220,
    headerHeight = 50,
    breakpoint = 'sm',
    showApps = true,
    showSiteSelector: showSiteSelectorProp,
  } = props;
  const [opened, { toggle }] = useDisclosure();
  const { user } = useAuthentication();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    isCollapsed,
    temporaryOverride,
    setUserPreferenceCollapsed,
    setToggleFunction,
    temporaryToggle,
  } = SidebarState();
  const { showBackButton } = ShowHeaderBackButtonState();
  const { showSiteSelector: showSiteSelectorStore } = ShowSiteSelectorState();
  const showSiteSelector =
    showSiteSelectorProp !== undefined ? showSiteSelectorProp : showSiteSelectorStore;
  const { goToSiteLink } = GoToSiteLinkState();
  const { hideNotifications, hideProfileDropdown, hideGoToSite, hideSiteSelector } =
    HideHeaderItemsState();
  const { back } = useBack();
  const { confirmNavigation } = NavigationConfirmationState();
  const { organizationId, setOrganizationId } = OrganizationIdState((state) => state);
  const { setSettings } = SitePublicSettingsState();
  const { backendHost } = BackendHostURLState();

  // Refresh site settings when organization changes
  useEffect(() => {
    // Fetch on mount if current orgId doesn't match siteSettings
    const currentOrgId = OrganizationIdState.getState().organizationId;
    const currentSettings = SitePublicSettingsState.getState().settings;
    if (currentOrgId && currentOrgId !== currentSettings?.id) {
      const { backendHost: host } = BackendHostURLState.getState();
      fetch(`${host}/util/public_settings/${currentOrgId}`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) SitePublicSettingsState.getState().setSettings(data);
        })
        .catch(() => {});
    }

    // Subscribe for subsequent changes
    const unsub = OrganizationIdState.subscribe((state, prev) => {
      const newId = state.organizationId;
      if (!newId || newId === prev.organizationId) return;
      const { backendHost: host } = BackendHostURLState.getState();
      fetch(`${host}/util/public_settings/${newId}`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) SitePublicSettingsState.getState().setSettings(data);
        })
        .catch(() => {});
    });
    return unsub;
  }, []);

  // Update "go to site" link when org changes
  useEffect(() => {
    const unsub = SitePublicSettingsState.subscribe((state) => {
      const settings = state.settings;
      if (!settings) return;
      const orgs = OrganizationState.getState().organizations;
      const org = orgs.find((o) => o.id === settings.id);
      const domain = getOrganizationDomain(org || settings);
      const protocol = window.location.protocol;
      const port = domain.includes(':')
        ? ''
        : window.location.port
          ? `:${window.location.port}`
          : '';
      GoToSiteLinkState.getState().setGoToSiteLink(`${protocol}//${domain}${port}/`);
    });
    // Also run immediately
    const settings = SitePublicSettingsState.getState().settings;
    if (settings) {
      const orgs = OrganizationState.getState().organizations;
      const org = orgs.find((o) => o.id === settings.id);
      const domain = getOrganizationDomain(org || settings);
      const protocol = window.location.protocol;
      const port = domain.includes(':')
        ? ''
        : window.location.port
          ? `:${window.location.port}`
          : '';
      GoToSiteLinkState.getState().setGoToSiteLink(`${protocol}//${domain}${port}/`);
    }
    return unsub;
  }, []);

  // Check if there are any visible navigation links for the current user
  const hasVisibleNavLinks = useMemo(() => {
    if (!navbarLinks?.length || !user) {
      return false;
    }

    const userRoleIds = user?.all_roles?.map((rec) => rec.string_id) || [];

    const checkLinkVisibility = (links) => {
      return links.some((link) => {
        const isVisible = link.roleIds
          ? link.roleIds.some((roleId) => userRoleIds.includes(roleId))
          : true;

        if (isVisible) return true;

        // Check children recursively
        if (link.children?.length > 0) {
          return checkLinkVisibility(link.children);
        }

        return false;
      });
    };

    const result = checkLinkVisibility(navbarLinks);
    return result;
  }, [navbarLinks, user?.all_roles]);

  // User preference for sidebar collapse (desktop only)
  const { value: sidebarCollapsed, setValue: setSidebarCollapsed } = useUserPreferences(
    'sidebarCollapsed',
    {
      defaultValue: false,
    },
  );

  const toggleSidebarCollapse = () => {
    // If there's a temporary override active, use temporaryToggle
    // Otherwise, use normal user preference toggle
    if (temporaryOverride !== null) {
      temporaryToggle();
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  // Sync user preference with store
  useEffect(() => {
    setUserPreferenceCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed, setUserPreferenceCollapsed]);

  // Provide toggle function to store
  useEffect(() => {
    setToggleFunction(toggleSidebarCollapse);
  }, [setToggleFunction]);

  const adjustedApps = [
    ...apps,
    {
      label: 'Organization',
      icon: IconUsers,
      className: 'bg-white text-slate-500',
      to: '/users',
      roleIds: ['super_admin_role', 'admin_role'],
    },
  ];

  return (
    <>
      <AppShell
        header={{
          height: headerHeight,
        }}
        navbar={{
          width: hasVisibleNavLinks ? navbarWidth : 0,
          breakpoint,
          collapsed: {
            mobile: !opened,
            desktop: isCollapsed,
          },
        }}
        padding="md"
      >
        <AppShell.Header withBorder={false} className="shadow">
          <div className={`flex items-center justify-between h-full px-2`}>
            <div className={`flex items-center h-full gap-2`}>
              {hasVisibleNavLinks && (
                <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
              )}
              {hasVisibleNavLinks && (
                <button
                  onClick={toggleSidebarCollapse}
                  className="hidden sm:flex items-center justify-center w-10 h-10 hover:bg-white/20 rounded border border-white/20 transition-colors cursor-pointer"
                  title={sidebarCollapsed ? t('Expand sidebar') : t('Collapse sidebar')}
                >
                  <img
                    src={`${import.meta.env.BASE_URL}images/sidebar.png`}
                    alt="Toggle sidebar"
                    className="h-6 w-6"
                  />
                </button>
              )}
              {showBackButton && (
                <Button
                  onClick={() => confirmNavigation(back)}
                  variant="subtle"
                  size="sm"
                  leftSection={<IconArrowLeft size={16} />}
                >
                  {t('Back')}
                </Button>
              )}

              {/*region site selector*/}
              {showSiteSelector && !hideSiteSelector && (
                <VisibilityControl
                  roleIds={[
                    'super_admin_role',
                    'admin_role',
                    'website_admin_role',
                    'website_editor_role',
                    'website_author_role',
                  ]}
                >
                  <div className="flex items-center gap-2 ml-4">
                    <div className="text-sm font-semibold hidden lg:block">{t('Select Site')}</div>
                    <SiteSelector
                      inputClassNames={{ input: 'md:!min-w-52 !border-gray-200' }}
                      value={organizationId ? { id: organizationId } : null}
                      setValue={(value) => setOrganizationId(value?.id || null)}
                      onAddClick={() => navigate('/sites/new')}
                    />
                  </div>
                </VisibilityControl>
              )}
              {/*endregion site selector*/}
              {showSiteSelector && !hideGoToSite && !hideSiteSelector && (
                <a
                  href={goToSiteLink}
                  target="_blank"
                  className="block my-2 w-8 h-8"
                  rel="noreferrer"
                >
                  <IconArrowUpRight
                    size={16}
                    className="w-full h-full text-xl text-white bg-black rounded p-1 hover:translate-y-0.5 transition-all"
                  />
                </a>
              )}
            </div>
            <div className={`flex items-center gap-4`}>
              {(trackingSettings.enableAnonUsers ? user?.signed_up === true : user) ? (
                <>
                  {/* <LangSwitcher /> */}

                  <AppsDropdown apps={adjustedApps} showApps={showApps} />

                  {/*notifications dropdown   */}
                  {/* {!hideNotifications && <NotificationsDropdown />} */}

                  {/*profile dropdown*/}
                  {!hideProfileDropdown && <ProfileDropdown />}
                </>
              ) : (
                <Link to={`/login`}>
                  <Button>{t('Login')}</Button>
                </Link>
              )}
            </div>
          </div>
        </AppShell.Header>

        {hasVisibleNavLinks && (
          <AppShell.Navbar
            withBorder={false}
            className="text-primary-contrastText p-2 shadow-lg flex flex-col justify-between"
            style={{
              backgroundImage: `linear-gradient(120deg, #000000 0%, #525252 100%)`,
            }}
          >
            <div>
              <NavigationLinks links={navbarLinks} user={user} opened={opened} toggle={toggle} />
            </div>
          </AppShell.Navbar>
        )}

        <AppShell.Main>
          <Outlet />
        </AppShell.Main>
      </AppShell>
    </>
  );
}
