import { useState, useEffect } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { getFlagUrl } from '@deepsel/cms-utils/flags';
import useModel from '../../../common/api/useModel.jsx';
import H1 from '../../../common/ui/H1.jsx';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { Helmet } from 'react-helmet';
import SitePublicSettingsState from '../../../common/stores/SitePublicSettingsState.js';
import { Alert } from '@mantine/core';
import ListViewSearchBar from '../../../common/ui/ListViewSearchBar.jsx';
import LinkedCell from '../../../common/ui/LinkedCell.jsx';
import DataGridColumnMenu from '../../../common/ui/DataGridColumnMenu.jsx';
import ListViewPagination from '../../../common/ui/ListViewPagination.jsx';
import Checkbox from '../../../common/ui/Checkbox.jsx';
import { Link } from 'react-router-dom';
import Button from '../../../common/ui/Button.jsx';
import useAuthentication from '../../../common/api/useAuthentication.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import VisibilityControl from '../../../common/auth/VisibilityControl.jsx';
import { IconAlertTriangle, IconPhoto, IconPlus } from '@tabler/icons-react';
import useShowSiteSelector from '../../../common/hooks/useShowSiteSelector.js';
import { getAttachmentByNameRelativeUrl } from '@deepsel/cms-utils/common/utils';
import head from 'lodash/head';

export default function BlogPostList() {
  useShowSiteSelector();
  const { t } = useTranslation();
  const { user } = useAuthentication();
  const { organizationId } = OrganizationIdState();
  const { settings: siteSettings } = SitePublicSettingsState((state) => state);

  // Build initial filters
  const buildFilters = () => {
    const filters = [];

    // Add organization filter if organizationId is set
    if (organizationId) {
      filters.push({
        field: 'organization_id',
        operator: '=',
        value: organizationId,
      });
    }

    return filters;
  };

  const query = useModel('blog_post', {
    autoFetch: true,
    searchFields: ['slug'],
    syncPagingParamsWithURL: true,
    orderBy: { field: 'id', direction: 'desc' },
    filters: buildFilters(),
  });

  const {
    data: items,
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
  } = query;
  const [selectedRows, setSelectedRows] = useState([]);

  // Update filters when organizationId changes
  useEffect(() => {
    setFilters(buildFilters());
  }, [organizationId]);

  const pickContent = (contents) => {
    if (!contents || contents.length === 0) return null;
    const currentLang = i18n.language;
    const defaultLangId = siteSettings?.default_language_id;
    const defaultLangContent = contents.find((content) => content.locale_id === defaultLangId);

    let selectedContent = contents.find((content) => content.locale?.iso_code === currentLang);
    if (!selectedContent && defaultLangContent) selectedContent = defaultLangContent;
    if (!selectedContent)
      selectedContent = contents.find((content) => content.locale?.iso_code === 'en');
    if (!selectedContent) selectedContent = contents[0];
    return selectedContent;
  };

  const columns = [
    {
      field: 'id',
      headerName: '#',
      width: 80,
      renderCell: (params) => <strong>#{params.value}</strong>,
    },
    {
      field: 'featured_image',
      headerName: t('Image'),
      width: 140,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        const selectedContent = pickContent(params.row.contents);
        const image = selectedContent?.featured_image;
        // Match content locale; fall back to first available version if no match.
        const localeImage =
          image?.locale_versions?.find(
            (version) => version.locale?.id === selectedContent.locale_id,
          )?.locale || head(image?.locale_versions)?.locale;
        if (image?.name) {
          return (
            <img
              src={getAttachmentByNameRelativeUrl(image.name, localeImage?.iso_code)}
              alt={image.alt_text || ''}
              className="w-28 h-20 object-cover rounded"
            />
          );
        }
        return (
          <div className="w-28 h-20 flex items-center justify-center bg-gray-100 rounded text-gray-400">
            <IconPhoto size={28} />
          </div>
        );
      },
    },
    {
      field: 'contents',
      headerName: t('Title'),
      width: 350,
      sortable: false,
      valueGetter: (params) => {
        const selectedContent = pickContent(params.row.contents);
        return selectedContent?.title || '-';
      },
      renderCell: (params) => (
        <LinkedCell params={params} to={`${params.row.id}/edit`}>
          {params.value}
        </LinkedCell>
      ),
    },
    {
      field: 'slug',
      headerName: t('Slug'),
      width: 250,
      renderCell: (params) => (
        <LinkedCell params={params} to={`${params.row.id}/edit`}>
          {params.value || '-'}
        </LinkedCell>
      ),
    },
    {
      field: 'author',
      headerName: t('Author'),
      width: 200,
      sortable: false,
      filterable: false,
      valueGetter: (params) => {
        const author = params.row.author;
        if (!author) return '-';
        const fullName = [author.first_name, author.last_name].filter(Boolean).join(' ').trim();
        return fullName || author.name || author.username || author.email || '-';
      },
      renderCell: (params) => (
        <LinkedCell params={params} to={`${params.row.id}/edit`}>
          {params.value}
        </LinkedCell>
      ),
    },
    {
      field: 'languages',
      headerName: t('Languages'),
      width: 120,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        const contents = params.row.contents || [];
        if (contents.length === 0) return <span>-</span>;

        // Sort contents by locale name
        const sortedContents = [...contents].sort((a, b) => {
          const nameA = a.locale?.name || 'Unknown';
          const nameB = b.locale?.name || 'Unknown';
          return nameA.localeCompare(nameB);
        });

        return (
          <div className="flex gap-1 flex-wrap">
            {sortedContents.map((content, index) => (
              <span
                key={content.id || index}
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
      headerName: t('Published'),
      width: 200,
      renderCell: (params) => (
        <LinkedCell params={params} to={`${params.row.id}/edit`}>
          <Checkbox checked={params.value} readOnly />
        </LinkedCell>
      ),
    },
  ];

  return (
    <>
      <Helmet>
        <title>Blog Posts</title>
      </Helmet>
      <main className="h-[calc(100vh-50px-32px-20px)] flex flex-col m-auto px-[12px] sm:px-[24px]">
        <div className="flex w-full justify-between gap-2 my-3">
          <H1 className="text-[32px] font-bold text-primary">{t('Blog Posts')}</H1>
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
            <Link to={`/blog_posts/create`}>
              <Button
              >
                <IconPlus size={16} className="sm:mr-1" />
                {t('')}
                <span className={`hidden sm:inline`}>{t('Create Blog Post')}</span>
              </Button>
            </Link>
          </VisibilityControl>
        </div>

        <ListViewSearchBar
          query={query}
          columns={columns}
          selectedRows={selectedRows}
          setSelectedRows={setSelectedRows}
          allowDelete={
            user.roles.find((role) =>
              [
                'admin_role',
                'super_admin_role',
                'website_admin_role',
                'website_editor_role',
                'website_author_role',
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
          rows={items}
          columns={columns}
          rowCount={total}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          page={page - 1}
          onPageChange={(newPage) => setPage(newPage + 1)}
          rowsPerPageOptions={[20, 30, 50, 100]}
          rowHeight={96}
          disableRowSelectionOnClick
          checkboxSelection
          className={`!border-0 flex-1`}
          sx={{ height: '100%' }}
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
          onSortModelChange={(model) => {
            if (model.length > 0) {
              setOrderBy({
                field: model[0].field,
                direction: model[0].sort.toLowerCase(),
              });
            } else {
              setOrderBy(null);
            }
          }}
          onSelectionModelChange={(ids) => {
            setSelectedRows(items.filter((item) => ids.includes(item.id)));
          }}
          components={{
            ColumnMenu: DataGridColumnMenu,
            Footer: () => null,
          }}
          componentsProps={{ columnMenu: { query } }}
          localeText={{ noRowsLabel: t('Nothing here yet.') }}
        />

        <ListViewPagination query={query} />
      </main>
    </>
  );
}
