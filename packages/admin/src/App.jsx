import Notification from './common/notification/Notification.jsx';
import OpenRouterCallback from './components/admin/auth/OpenRouterCallback.jsx';
import { AIProviderConfigProvider } from './common/AIProviderConfigContext.js';
import TemplateEdit from './components/admin/template/TemplateEdit.jsx';
import TemplateList from './components/admin/template/TemplateList.jsx';
import ThemeList from './components/admin/theme/ThemeList.jsx';
import ThemeFileEdit from './components/admin/theme/ThemeFileEdit.jsx';
import PageEdit from './components/admin/page/PageEdit.jsx';
import PageList from './components/admin/page/PageList.tsx';
import MenuTree from './components/admin/menu/MenuTree.jsx';
import CronCreate from './components/admin/cron/CronCreate.jsx';
import CronEdit from './components/admin/cron/CronEdit.jsx';
import CronView from './components/admin/cron/CronView.jsx';
import CronList from './components/admin/cron/CronList.jsx';
import BlogPostEdit from './components/admin/blog_post/BlogPostEdit.jsx';
import BlogPostList from './components/admin/blog_post/BlogPostList.jsx';
import CMSLayout from './components/layouts/CMSLayout.jsx';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Login from './components/admin/auth/Login.jsx';
import ResetPasswordConfirmation from './components/admin/auth/ResetPasswordConfirmation.jsx';
import UserList from './components/admin/user/UserList.jsx';
import ManageUsersList from './components/admin/user/ManageUsersList.jsx';
import UserEdit from './components/admin/user/UserEdit.jsx';
import UserView from './components/admin/user/UserView.jsx';
import UserCreate from './components/admin/user/UserCreate.jsx';
import RoleList from './components/admin/role/RoleList.jsx';
import RoleEdit from './components/admin/role/RoleEdit.jsx';
import RoleView from './components/admin/role/RoleView.jsx';
import RoleCreate from './components/admin/role/RoleCreate.jsx';
import OrganizationLayout from './components/layouts/OrganizationLayout.jsx';
import ResetPassword from './components/admin/auth/ResetPassword.jsx';
import SMTPSettings from './components/admin/organization/SMTPSettings.jsx';
import SamlAuth from './common/auth/SamlAuth.jsx';
import OIDCAuthenticated from './common/auth/OIDCAuthenticated.jsx';
import OIDCProviderList from './components/admin/oidc_provider/OIDCProviderList.jsx';
import OIDCProviderEdit from './components/admin/oidc_provider/OIDCProviderEdit.jsx';
import OIDCInviteList from './components/admin/oidc_invite/OIDCInviteList.jsx';
import OIDCInviteCreate from './components/admin/oidc_invite/OIDCInviteCreate.jsx';
import SamlSetting from './components/admin/organization/SamlSetting.jsx';
import SiteSettings from './components/admin/site/SiteSettings.jsx';
import SiteSettingsGeneral from './components/admin/site/settings/SiteSettingsGeneral.jsx';
import SiteSettingsAI from './components/admin/site/settings/SiteSettingsAI.jsx';
import SiteSettingsBackup from './components/admin/site/settings/SiteSettingsBackup.jsx';
import SiteSettingsAuthentication from './components/admin/site/settings/SiteSettingsAuthentication.jsx';
import SiteSettingsAuthGeneral from './components/admin/site/settings/SiteSettingsAuthGeneral.jsx';
import SiteCreate from './components/admin/site/SiteCreate.jsx';
import Media from './components/admin/attachment/Media.jsx';
import RequireAuth from './common/auth/RequireAuth.jsx';
import PublicAuth from './common/auth/PublicAuth.jsx';
import FormList from './components/admin/form/FormList.jsx';
import FormUpsert from './components/admin/form/FormUpsert.jsx';
import FormView from './components/admin/form/FormView.jsx';
import FormSubmissionList from './components/admin/form-submission/FormSubmissionList.jsx';
import FormSubmissionView from './components/admin/form-submission/FormSubmissionView.jsx';

import { useCallback, useEffect, useMemo } from 'react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import mantineTheme from './theme/mantineTheme.js';
import cssVariablesResolver from './theme/cssVariablesResolver.js';
import muiTheme from './theme/muiTheme.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import tz from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import './i18n.js';
import { useTranslation } from 'react-i18next';
import SitePublicSettingsState from './common/stores/SitePublicSettingsState.js';
import BackendHostURLState from './common/stores/BackendHostURLState.js';
import APISchemaState from './common/stores/APISchemaState.js';

dayjs.extend(utc);
dayjs.extend(tz);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(customParseFormat);

import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/tiptap/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/notifications/styles.css';
import './theme/tokens.css';
import './assets/css/global.css';
import './theme/components.css';
import '@deepsel/cms-utils/styles.css';
import '@deepsel/cms-react/styles/form.css';
import { LocalstorageKey } from './constants/localstorage.js';
import useBrowserLanguages from './common/hooks/useBrowserLanguages.js';
import useEffectOnce from './common/hooks/useEffectOnce.js';
import { BasenameProvider } from './common/BasenameContext.js';

export default function App(props) {
  console.log('APP', { props });
  const {
    siteSettings,
    basename = '/admin',
    backendHost: backendHostProp,
    aiProviderConfig,
  } = props;
  const aiConfig = aiProviderConfig || {
    mode: 'api_key',
    provider: 'openrouter',
    oauthCallbackPath: '/openrouter-callback',
  };
  const { i18n } = useTranslation();
  const { setSettings } = SitePublicSettingsState();
  const browserLanguages = useBrowserLanguages();

  /**
   * Initial path
   * @type {string}
   */
  const initialPath = useMemo(() => props.initialPath, [props.initialPath]);

  /**
   * Default site language
   * @type {Locale || null}
   */
  const defaultSiteLanguage = useMemo(
    () => props.siteSettings?.default_language || null,
    [props.siteSettings?.default_language],
  );

  /**
   * Available language for this page
   * @type {Array<Locale>}
   */
  const availableSiteLanguages = useMemo(
    () => props.siteSettings?.available_languages || [],
    [props.siteSettings?.available_languages],
  );

  /**
   * Get alternatives languages of this page
   * @type {Array<{slug: string, locale: Locale}>}
   */
  const languageAlternatives = useMemo(
    () => props.initialPageData?.language_alternatives || [],
    [props.initialPageData?.language_alternatives],
  );

  /**
   * Func to redirect to site with default language
   */
  const redirectToDefaultLanguageSite = useCallback(() => {
    if (
      defaultSiteLanguage &&
      languageAlternatives.find((o) => o.locale.iso_code === defaultSiteLanguage.iso_code)
    ) {
      location.href = `/${defaultSiteLanguage.iso_code}${initialPath}`;
    }
  }, [defaultSiteLanguage, initialPath, languageAlternatives]);

  /**
   * Initialize i18n language
   * Prioritize localstorage first, then default site language
   */
  useEffectOnce(() => {
    const i18NextLangStorage = localStorage.getItem(LocalstorageKey.I18NextLang);
    if (i18NextLangStorage) {
      if (availableSiteLanguages.find((o) => o.iso_code === i18NextLangStorage)) {
        i18n.changeLanguage(i18NextLangStorage).then();
      } else {
        if (defaultSiteLanguage) {
          localStorage.setItem(LocalstorageKey.I18NextLang, defaultSiteLanguage.iso_code);
          i18n.changeLanguage(defaultSiteLanguage.iso_code).then();
        }
      }
    }
  });

  /**
   * Initialize language site
   *
   * browser lang in site languages → set lang = browser lang
   * browser lang not in site languages → set lang = site default lang
   * cannot detect → set lang = site default lang
   */
  useEffectOnce(() => {
    // Get lang code in url
    const langCodeInPathRaw = location.href.split(location.origin)[1].split('/')[1];
    const langCodeInPath = availableSiteLanguages.find(
      (o) => o.iso_code.toLowerCase() === langCodeInPathRaw?.toLowerCase(),
    )?.iso_code;

    if (langCodeInPath) {
      // If url has the language code in url path, keeps everything
      i18n.changeLanguage(langCodeInPath).then();
    } else {
      // If the url does not have lang code, check saved lang in localstorage
      const i18NextLangStorage = localStorage.getItem(LocalstorageKey.I18NextLang);
      if (i18NextLangStorage) {
        // If localstorage has valid lang code, redirect site to that lang
        const languageAlternative = languageAlternatives.find(
          (o) => o.locale.iso_code === i18NextLangStorage,
        );
        if (languageAlternative && languageAlternative.locale.iso_code !== i18NextLangStorage) {
          location.href = `/${languageAlternative.locale.iso_code}${languageAlternative.slug}`;
        }
      } else {
        // If localstorage does not have lang code, move to check the browser languages
        let detectedSiteLanguage = null;
        for (const browserLanguage of browserLanguages) {
          const lowerCaseBrowserLanguage = browserLanguage.toLowerCase();
          detectedSiteLanguage = availableSiteLanguages.find((availableSiteLanguage) => {
            const lowerCaseIsoCode = availableSiteLanguage.iso_code.toLowerCase();
            return (
              lowerCaseIsoCode === lowerCaseBrowserLanguage ||
              lowerCaseIsoCode.includes(lowerCaseBrowserLanguage) ||
              lowerCaseBrowserLanguage.includes(lowerCaseIsoCode)
            );
          });
          if (detectedSiteLanguage) {
            break;
          }
        }

        // If browser lang is supported by site languages
        if (detectedSiteLanguage) {
          if (props.initialPageData) {
            const detectedLanguageAlternative = languageAlternatives.find(
              (languageAlternative) =>
                languageAlternative.locale.iso_code === detectedSiteLanguage.iso_code,
            );
            if (detectedLanguageAlternative) {
              location.href = `/${detectedLanguageAlternative.locale.iso_code}${detectedLanguageAlternative.slug}`;
            } else {
              redirectToDefaultLanguageSite();
            }
          } else {
            // If it doesn't have initialPageData, it is usually in admin pages
            i18n.changeLanguage(detectedSiteLanguage.iso_code).then();
          }
        } else {
          props.initialPageData && redirectToDefaultLanguageSite();
        }
      }
    }
  });

  /**
   * Detect i18n language change to update to localStorage
   */
  useEffect(() => {
    localStorage.setItem(LocalstorageKey.I18NextLang, i18n.language);
  }, [i18n.language]);

  useEffect(() => {
    // Initialize site settings state with initial data
    if (siteSettings) {
      setSettings(siteSettings);
    }
  }, [i18n, setSettings, siteSettings]);

  useEffect(() => {
    // Override backendHost when provided by the host app (e.g. Astro)
    // so API calls go through the same-origin proxy and cookies work
    if (backendHostProp) {
      BackendHostURLState.getState().setBackendHost(backendHostProp);
    }
    // Fetch API schema after backendHost is configured
    APISchemaState.getState().fetchAPISchema();
  }, [backendHostProp]);

  return (
    <AIProviderConfigProvider value={aiConfig}>
      <BasenameProvider value={basename}>
        <MantineProvider
          theme={mantineTheme}
          cssVariablesResolver={cssVariablesResolver}
          forceColorScheme="light"
        >
          <ModalsProvider>
            <MuiThemeProvider theme={muiTheme}>
              <BrowserRouter basename={basename}>
                <Notification />
                <Routes>
                  <Route path="/openrouter-callback" element={<OpenRouterCallback />} />
                  <Route element={<PublicAuth />}>
                    <Route path="/saml-authenticated" element={<SamlAuth />} />
                    <Route path="/oidc-authenticated" element={<OIDCAuthenticated />} />
                    <Route path="/login" element={<Login />} />
                    <Route
                      path="/reset-password-confirmation/:token"
                      element={<ResetPasswordConfirmation />}
                    />
                    <Route path="/reset-password" element={<ResetPassword />} />
                  </Route>

                  <Route element={<RequireAuth />}>
                    <Route element={<CMSLayout />}>
                      <Route path="/templates" element={<TemplateList />} />
                      <Route path="/templates/create" element={<TemplateEdit />} />
                      <Route path="/templates/:id/edit" element={<TemplateEdit />} />
                      <Route path="/themes" element={<ThemeList />} />
                      <Route path="/themes/edit/:themeName" element={<ThemeFileEdit />} />

                      <Route path="/forms" element={<FormList />} />
                      <Route path="/forms/create" element={<FormUpsert />} />
                      <Route path="/forms/:id" element={<FormView />} />
                      <Route path="/forms/:id/edit" element={<FormUpsert />} />
                      <Route path="/form-submissions" element={<FormSubmissionList />} />
                      <Route path="/form-submissions/:id" element={<FormSubmissionView />} />

                      <Route path="/blog_posts" element={<BlogPostList />} />
                      <Route path="/blog_posts/create" element={<BlogPostEdit />} />
                      <Route path="/blog_posts/:id/edit" element={<BlogPostEdit />} />
                      <Route path="/pages" element={<PageList />} />
                      <Route path="/pages/create" element={<PageEdit />} />
                      <Route path="/pages/:id/edit" element={<PageEdit />} />
                      <Route path="/pages/:id" element={<Navigate to="edit" replace />} />
                      <Route path="/menus" element={<MenuTree />} />
                      <Route path="/manage-users" element={<ManageUsersList />} />
                      <Route path="/manage-users/:id/edit" element={<UserEdit />} />
                      <Route path="/manage-users/:id" element={<UserView />} />
                      <Route path="/manage-users/create" element={<UserCreate />} />
                      <Route path="/site-settings" element={<SiteSettings />} />
                      <Route path="/site-settings/general" element={<SiteSettingsGeneral />} />
                      <Route path="/site-settings/ai" element={<SiteSettingsAI />} />
                      <Route
                        path="/site-settings/auth-general"
                        element={<SiteSettingsAuthGeneral />}
                      />
                      <Route path="/site-settings/backup" element={<SiteSettingsBackup />} />
                      <Route
                        path="/site-settings/authentication"
                        element={<SiteSettingsAuthentication />}
                      />
                      <Route path="/smtp-settings" element={<SMTPSettings />} />
                      <Route path="/sites/new" element={<SiteCreate />} />
                      <Route path="/media" element={<Media />} />
                      <Route path="/oidc-providers" element={<OIDCProviderList />} />
                      <Route path="/oidc-providers/create" element={<OIDCProviderEdit />} />
                      <Route path="/oidc-providers/:id/edit" element={<OIDCProviderEdit />} />
                      <Route path="/oidc-invites" element={<OIDCInviteList />} />
                      <Route path="/oidc-invites/create" element={<OIDCInviteCreate />} />
                    </Route>

                    <Route element={<OrganizationLayout />}>
                      <Route path="/profile/:id/edit" element={<UserEdit />} />
                      <Route path="/users" element={<UserList />} />
                      <Route path="/users/:id/edit" element={<UserEdit />} />
                      <Route path="/users/:id" element={<UserView />} />
                      <Route path="/users/create" element={<UserCreate />} />
                      <Route path="/roles" element={<RoleList />} />
                      <Route path="/roles/:id/edit" element={<RoleEdit />} />
                      <Route path="/roles/:id" element={<RoleView />} />
                      <Route path="/roles/create" element={<RoleCreate />} />

                      <Route path="/crons" element={<CronList />} />
                      <Route path="/crons/create" element={<CronCreate />} />
                      <Route path="/crons/:id/edit" element={<CronEdit />} />
                      <Route path="/crons/:id" element={<CronView />} />
                      <Route path="/saml-settings" element={<SamlSetting />} />
                    </Route>
                  </Route>

                  <Route path="*" element={<Navigate to="/pages" replace />} />
                </Routes>
              </BrowserRouter>
            </MuiThemeProvider>
          </ModalsProvider>
        </MantineProvider>
      </BasenameProvider>
    </AIProviderConfigProvider>
  );
}
