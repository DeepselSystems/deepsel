import { useEffect, useMemo, useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import { getFlagUrl } from '@deepsel/cms-utils/flags';
import useModel from '../../../common/api/useModel.jsx';
import useAuthentication from '../../../common/api/useAuthentication.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import H1 from '../../../common/ui/H1.jsx';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { Helmet } from 'react-helmet';
import SitePublicSettingsState from '../../../common/stores/SitePublicSettingsState.js';
import OrganizationState from '../../../common/stores/OrganizationState.js';
import { buildPageUrlWithDomain, buildPagePath, buildFullUrl } from '../../../utils/domainUtils.js';
import { Alert, Badge, Tooltip } from '@mantine/core';
import ListViewSearchBar from '../../../common/ui/ListViewSearchBar.jsx';
import LinkedCell from '../../../common/ui/LinkedCell.jsx';
import DataGridColumnMenu from '../../../common/ui/DataGridColumnMenu.jsx';
import ListViewPagination from '../../../common/ui/ListViewPagination.jsx';
import { Link } from 'react-router-dom';
import Button from '../../../common/ui/Button.jsx';
import VisibilityControl from '../../../common/auth/VisibilityControl.jsx';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import { Preferences } from '@capacitor/preferences';
import { IconAlertTriangle, IconExternalLink, IconPalette, IconPlus } from '@tabler/icons-react';
import useShowSiteSelector from '../../../common/hooks/useShowSiteSelector.js';

type PageLocale = {
  iso_code?: string;
  name?: string;
};

type PageContent = {
  id?: number | string;
  locale_id?: number | string;
  locale?: PageLocale;
  title?: string;
  slug?: string;
  published?: boolean;
  has_draft?: boolean;
};

type PageRow = {
  id: number;
  organization_id?: number | string;
  contents?: PageContent[];
  published?: boolean;
};

type ThemePageRow = {
  id: string;
  _isThemeRow: true;
  _themeSlug: string;
  _themeTitle: string;
  _themeEditorLink: string;
};

type CombinedRow = PageRow | ThemePageRow;

const isThemeRow = (row: CombinedRow): row is ThemePageRow =>
  '_isThemeRow' in row && (row as ThemePageRow)._isThemeRow === true;

const slugToTitle = (slug: string): string => {
  if (slug === '/') return 'Home';
  return slug
    .replace(/^\//, '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export default function PageList() {
  useShowSiteSelector();
  const { t } = useTranslation();
  const { user } = useAuthentication();
  const { organizationId } = OrganizationIdState();
  const { settings: siteSettings } = SitePublicSettingsState((state: any) => state);
  const { organizations } = OrganizationState();
  const { backendHost } = BackendHostURLState() as any;
  const ButtonAny = Button as any;

  // Fetch theme page slugs for conflict detection
  const [themeSlugs, setThemeSlugs] = useState<string[]>([]);
  useEffect(() => {
    const selectedTheme = siteSettings?.selected_theme;
    if (!selectedTheme || !backendHost) return;

    const fetchThemeSlugs = async () => {
      try {
        const tokenResult = await Preferences.get({ key: 'token' });
        const headers: Record<string, string> = {};
        if (tokenResult?.value) {
          headers.Authorization = `Bearer ${tokenResult.value}`;
        }
        if (organizationId) {
          headers['X-Organization-Id'] = String(organizationId);
        }
        const response = await fetch(`${backendHost}/theme/page-slugs/${selectedTheme}`, {
          headers,
        });
        if (!response.ok) return;
        const data = await response.json();
        setThemeSlugs(data.slugs || []);
      } catch (e) {
        console.error('Error fetching theme page slugs:', e);
      }
    };
    fetchThemeSlugs();
  }, [siteSettings?.selected_theme, backendHost, organizationId]);

  const getThemeEditorLink = (slug: string): string | null => {
    if (!siteSettings?.selected_theme || !themeSlugs.includes(slug)) return null;
    const filename = slug === '/' ? 'Index.astro' : `${slug.replace(/^\//, '')}.astro`;
    return `/themes/edit/${siteSettings.selected_theme}?file=${encodeURIComponent(filename)}`;
  };

  const query = useModel('page', {
    autoFetch: true,
    searchFields: ['contents.title', 'contents.slug'],
    orderBy: { field: 'id', direction: 'desc' },
    filters: organizationId
      ? [{ field: 'organization_id', operator: '=', value: organizationId }]
      : [],
  } as any) as any;

  const {
    data: rawItems,
    loading,
    error,
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    orderBy,
    setOrderBy,
    setFilters,
  } = query as any;

  const items = (rawItems ?? []) as PageRow[];
  const [selectedRows, setSelectedRows] = useState<PageRow[]>([]);
  const { searchTerm } = query as any;

  // Build merged rows: theme virtual rows replace DB pages with same slug
  const mergedRows: CombinedRow[] = useMemo(() => {
    if (page !== 1) return items;
    if (!themeSlugs.length || !siteSettings?.selected_theme) return items;

    const themeSlugsSet = new Set(themeSlugs);

    // Hide only when every locale slug is shadowed — a page with any
    // non-shadowed locale is still reachable at that locale's URL.
    const filteredItems = items.filter((item) => {
      const slugs = (item.contents ?? []).map((c) => c.slug).filter(Boolean);
      if (!slugs.length) return true;
      return !slugs.every((slug) => themeSlugsSet.has(slug!));
    });

    let themeRows: ThemePageRow[] = themeSlugs.map((slug) => {
      const filename = slug === '/' ? 'Index.astro' : `${slug.replace(/^\//, '')}.astro`;
      return {
        id: `theme:${slug}`,
        _isThemeRow: true as const,
        _themeSlug: slug,
        _themeTitle: slugToTitle(slug),
        _themeEditorLink: `/themes/edit/${siteSettings.selected_theme}?file=${encodeURIComponent(filename)}`,
      };
    });

    // Theme pages are static files with no DB row, so the backend /page/search
    // endpoint can never match them — filter them here by title/slug instead
    // of dropping them whenever a search term is active.
    if (searchTerm) {
      const normalizedSearch = searchTerm.toLowerCase();
      themeRows = themeRows.filter(
        (row) =>
          row._themeTitle.toLowerCase().includes(normalizedSearch) ||
          row._themeSlug.toLowerCase().includes(normalizedSearch),
      );
    }

    return [...themeRows, ...filteredItems];
  }, [items, themeSlugs, page, searchTerm, siteSettings?.selected_theme]);

  // Re-sync org filter when org changes (autoFetch handles initial + re-fetch)
  useEffect(() => {
    setFilters(
      organizationId ? [{ field: 'organization_id', operator: '=', value: organizationId }] : [],
    );
  }, [organizationId, setFilters]);

  const getContentForCurrentLanguage = (
    contents: PageContent[] | null | undefined,
  ): PageContent | null => {
    if (!contents || contents.length === 0) return null;

    const currentLang = i18n.language;

    const defaultLangId = siteSettings?.default_language_id;
    const defaultLangContent = contents.find((content) => content.locale_id === defaultLangId);

    let selectedContent: PageContent | undefined;

    selectedContent = contents.find((content) => content.locale?.iso_code === currentLang);

    if (!selectedContent && defaultLangContent) {
      selectedContent = defaultLangContent;
    }

    if (!selectedContent) {
      selectedContent = contents.find((content) => content.locale?.iso_code === 'en');
    }

    if (!selectedContent) {
      selectedContent = contents[0];
    }

    return selectedContent;
  };

  const columns: GridColDef[] = [
    {
      field: 'id',
      headerName: '#',
      width: 80,
      renderCell: (params: any) => {
        if (isThemeRow(params.row)) {
          return (
            <LinkedCell params={params} to={params.row._themeEditorLink}>
              <IconPalette size={16} className="text-violet-500" />
            </LinkedCell>
          );
        }
        return (
          <LinkedCell params={params} to={`/pages/${params.row.id}/edit`}>
            <strong>#{params.value}</strong>
          </LinkedCell>
        );
      },
    },
    {
      field: 'contents',
      headerName: t('Title'),
      width: 350,
      sortable: false,
      valueGetter: (params: any) => {
        if (isThemeRow(params.row)) return params.row._themeTitle;
        const selectedContent = getContentForCurrentLanguage(params.row.contents);
        return selectedContent?.title || '-';
      },
      renderCell: (params: any) => {
        if (isThemeRow(params.row)) {
          return (
            <LinkedCell params={params} to={params.row._themeEditorLink}>
              <span className="flex items-center gap-2">
                {params.value}
                <Badge size="sm" variant="light" color="violet">
                  {t('Theme')}
                </Badge>
              </span>
            </LinkedCell>
          );
        }
        const selectedContent = getContentForCurrentLanguage(params.row.contents);
        const themeLink = selectedContent?.slug ? getThemeEditorLink(selectedContent.slug) : null;
        const themeSlugsSet = new Set(themeSlugs);
        const conflicts = (params.row.contents ?? [])
          .filter((c: PageContent) => c.slug && themeSlugsSet.has(c.slug))
          .map((c: PageContent) => ({
            lang: c.locale?.name || c.locale?.iso_code || t('Unknown'),
            slug: c.slug!,
            themeTitle: slugToTitle(c.slug!),
          }));
        return (
          <LinkedCell params={params} to={themeLink || `/pages/${params.row.id}/edit`}>
            <span className="flex items-center gap-2">
              {params.value}
              {conflicts.length > 0 && (
                <Tooltip
                  multiline
                  w={320}
                  withArrow
                  label={
                    <div>
                      {conflicts.map((c) => (
                        <div key={`${c.lang}-${c.slug}`}>
                          {t('{{lang}} uses "{{slug}}" — same slug as theme page "{{title}}"', {
                            lang: c.lang,
                            slug: c.slug,
                            title: c.themeTitle,
                          })}
                        </div>
                      ))}
                      <div className="mt-2 opacity-80">
                        {t(
                          'Visitors at these URLs will see the theme page instead. Change the slug here to show this content on your site.',
                        )}
                      </div>
                    </div>
                  }
                >
                  <IconAlertTriangle
                    size={16}
                    className="text-yellow-600 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                </Tooltip>
              )}
            </span>
          </LinkedCell>
        );
      },
    },
    {
      field: 'slug',
      headerName: t('Slug'),
      width: 250,
      sortable: false,
      valueGetter: (params: any) => {
        if (isThemeRow(params.row)) return params.row._themeSlug;
        const selectedContent = getContentForCurrentLanguage(params.row.contents);
        if (!selectedContent?.slug) return '-';
        if (!selectedContent?.locale?.iso_code) return '-';
        return buildPagePath(
          selectedContent.slug,
          selectedContent.locale?.iso_code,
          siteSettings?.default_language,
        );
      },
      renderCell: (params: any) => {
        if (isThemeRow(params.row)) {
          return (
            <LinkedCell params={params} to={params.row._themeEditorLink}>
              {params.value}
            </LinkedCell>
          );
        }
        const selectedContent = getContentForCurrentLanguage(params.row.contents);
        const themeLink = selectedContent?.slug ? getThemeEditorLink(selectedContent.slug) : null;
        return (
          <LinkedCell params={params} to={themeLink || `/pages/${params.row.id}/edit`}>
            {params.value || '-'}
          </LinkedCell>
        );
      },
    },
    {
      field: 'languages',
      headerName: t('Languages'),
      width: 120,
      sortable: false,
      filterable: false,
      renderCell: (params: any) => {
        if (isThemeRow(params.row)) return <span>-</span>;
        const contents = params.row.contents || [];
        if (contents.length === 0) return <span>-</span>;

        const sortedContents = [...contents].sort((a, b) => {
          const nameA = a.locale?.name || 'Unknown';
          const nameB = b.locale?.name || 'Unknown';
          return nameA.localeCompare(nameB);
        });

        return (
          <div className="flex gap-1 flex-wrap">
            {sortedContents.map((content, index) => (
              <span
                key={(content.id as any) || index}
                title={content.locale?.name || 'Unknown'}
                className="text-lg"
              >
                <img
                  src={getFlagUrl(content.locale?.iso_code ?? '')}
                  alt={content.locale?.name ?? ''}
                  className="h-4 w-auto rounded-sm inline-block"
                />
              </span>
            ))}
          </div>
        );
      },
    },
    {
      field: 'published',
      headerName: t('Status'),
      width: 200,
      renderCell: (params: any) => {
        if (isThemeRow(params.row)) {
          return (
            <LinkedCell params={params} to={params.row._themeEditorLink}>
              <Badge size="sm" variant="light" color="green" radius="sm">
                {t('Published')}
              </Badge>
            </LinkedCell>
          );
        }
        const selectedContent = getContentForCurrentLanguage(params.row.contents);
        const isPublished = Boolean(selectedContent?.published);
        const hasDraft = Boolean(selectedContent?.has_draft);
        const color = !isPublished ? 'gray' : hasDraft ? 'blue' : 'green';
        const label = !isPublished
          ? t('Draft')
          : hasDraft
            ? t('Published · Draft pending')
            : t('Published');
        const themeLink = selectedContent?.slug ? getThemeEditorLink(selectedContent.slug) : null;
        return (
          <LinkedCell params={params} to={themeLink || `/pages/${params.row.id}/edit`}>
            <Badge size="sm" variant="light" color={color} radius="sm">
              {label}
            </Badge>
          </LinkedCell>
        );
      },
    },
    {
      field: 'actions',
      headerName: '',
      width: 70,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params: any) => {
        if (isThemeRow(params.row)) {
          const themePageUrl = buildFullUrl(
            { organization_id: organizationId },
            params.row._themeSlug,
            organizations,
          );
          return (
            <div className="flex justify-center">
              <ButtonAny
                component="a"
                href={themePageUrl}
                target="_blank"
                variant="subtle"
                size="sm"
                className="p-1 min-w-0 text-gray-600 hover:text-primary-main"
                title={t('Go to page')}
              >
                <IconExternalLink size={16} />
              </ButtonAny>
            </div>
          );
        }
        const selectedContent = getContentForCurrentLanguage(params.row.contents);
        if (!selectedContent?.slug) return null;
        if (!selectedContent?.locale?.iso_code) return null;

        const pageUrl = buildPageUrlWithDomain(
          params.row,
          selectedContent.slug,
          selectedContent.locale?.iso_code,
          siteSettings?.default_language,
          organizations,
        );

        if (!params.row.published) {
          return null;
        }

        return (
          <div className="flex justify-center">
            <ButtonAny
              component="a"
              href={pageUrl}
              target="_blank"
              variant="subtle"
              size="sm"
              className="p-1 min-w-0 text-gray-600 hover:text-primary-main"
              title={t('Go to page')}
            >
              <IconExternalLink size={16} />
            </ButtonAny>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <Helmet>
        <title>Pages</title>
      </Helmet>
      <main className="h-[calc(100vh-50px-32px-20px)] flex flex-col m-auto px-[12px] sm:px-[24px]">
        <div className="flex w-full justify-between gap-2 my-3">
          <H1 className="text-[32px] font-bold">{t('Pages')}</H1>
          <VisibilityControl
            roleIds={[
              'super_admin_role',
              'admin_role',
              'website_admin_role',
              'website_editor_role',
              'website_author_role',
            ]}
            render={false}
          >
            <Link to={`/pages/create`}>
              <ButtonAny>
                <IconPlus size={16} className="sm:mr-1" />
                {t('')}
                <span className={`hidden sm:inline`}>{t('Create Page')}</span>
              </ButtonAny>
            </Link>
          </VisibilityControl>
        </div>

        <ListViewSearchBar
          query={query}
          columns={columns}
          selectedRows={selectedRows}
          setSelectedRows={setSelectedRows}
          allowDelete={
            user.roles.find((role: any) =>
              [
                'admin_role',
                'super_admin_role',
                'website_admin_role',
                'website_editor_role',
              ].includes(role.string_id),
            ) || false
          }
        />

        {error && (
          <Alert
            color="red"
            variant="light"
            title="Error"
            className="mb-4"
            icon={<IconAlertTriangle size={16} />}
          >
            {error}
          </Alert>
        )}

        <DataGrid
          paginationMode="server"
          sortingMode="server"
          filterMode="server"
          loading={loading}
          rows={mergedRows}
          columns={columns}
          rowCount={total}
          getRowId={(row: CombinedRow) => row.id}
          isRowSelectable={(params: any) => !isThemeRow(params.row)}
          getRowClassName={(params: any) => (isThemeRow(params.row) ? 'theme-page-row' : '')}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          page={page - 1}
          onPageChange={(newPage: number) => setPage(newPage + 1)}
          rowsPerPageOptions={[20, 30, 50, 100]}
          disableSelectionOnClick
          checkboxSelection
          className={`!border-0 `}
          sx={{
            '& .theme-page-row': {
              backgroundColor: 'rgba(139, 92, 246, 0.04)',
            },
          }}
          sortModel={
            orderBy
              ? [
                  {
                    field: orderBy.field,
                    sort: orderBy.direction?.toLowerCase(),
                  },
                ]
              : []
          }
          onSortModelChange={(model: any) => {
            if (model.length > 0) {
              setOrderBy({
                field: model[0].field,
                direction: model[0].sort.toLowerCase(),
              });
            } else {
              setOrderBy(null);
            }
          }}
          onSelectionModelChange={(ids: any) => {
            const numericIds = (ids || []).filter((id: any) => typeof id === 'number');
            setSelectedRows(items.filter((item) => numericIds.includes(item.id)));
          }}
          components={{
            ColumnMenu: DataGridColumnMenu,
            Footer: () => null,
          }}
          componentsProps={{ columnMenu: { query } } as any}
          localeText={{ noRowsLabel: t('Nothing here yet.') }}
        />

        <ListViewPagination query={query} />
      </main>
    </>
  );
}
