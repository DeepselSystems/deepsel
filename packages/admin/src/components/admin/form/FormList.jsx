import React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { getFlagUrl } from '@deepsel/cms-utils/flags';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import H1 from '../../../common/ui/H1.jsx';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { Helmet } from 'react-helmet';
import SitePublicSettingsState from '../../../common/stores/SitePublicSettingsState.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faPlus } from '@fortawesome/free-solid-svg-icons';
import { Alert } from '@mantine/core';
import ListViewSearchBar from '../../../common/ui/ListViewSearchBar.jsx';
import LinkedCell from '../../../common/ui/LinkedCell.jsx';
import DataGridColumnMenu from '../../../common/ui/DataGridColumnMenu.jsx';
import ListViewPagination from '../../../common/ui/ListViewPagination.jsx';
import Checkbox from '../../../common/ui/Checkbox.jsx';
import { Link } from 'react-router-dom';
import Button from '../../../common/ui/Button.jsx';
import VisibilityControl from '../../../common/auth/VisibilityControl.jsx';
import FormActionsCell from './components/FormActionsCell/index.jsx';
import UserState from '../../../common/stores/UserState.js';
import useModel from '../../../common/api/useModel.jsx';

const FormList = () => {
  const { t } = useTranslation();
  const { user } = UserState();
  const { organizationId } = OrganizationIdState();
  const { settings: siteSettings } = SitePublicSettingsState((state) => state);
  const query = useModel('form', {
    autoFetch: true,
    searchFields: ['contents.title', 'contents.slug'],
    syncPagingParamsWithURL: true,
    orderBy: { field: 'id', direction: 'desc' },
    filters: organizationId
      ? [
          {
            field: 'organization_id',
            operator: '=',
            value: organizationId,
          },
        ]
      : [],
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
  const [selectedRows, setSelectedRows] = React.useState([]);

  // Update filters when organizationId changes
  React.useEffect(() => {
    setFilters(
      organizationId
        ? [
            {
              field: 'organization_id',
              operator: '=',
              value: organizationId,
            },
          ]
        : [],
    );
  }, [organizationId, setFilters]);

  // Function to get the appropriate content based on current language
  const getContentForCurrentLanguage = (contents) => {
    if (!contents || contents.length === 0) return null;

    // Get the current language from i18n
    const currentLang = i18n.language;

    // Get the default site language code
    const defaultLangId = siteSettings?.default_language_id;
    const defaultLangContent = contents.find((content) => content.locale_id === defaultLangId);

    // Find content based on priority order:
    // 1. Selected language
    // 2. Default site language
    // 3. English (en_US)
    // 4. First found content
    let selectedContent;

    // 1. Try to find content matching the current selected language
    selectedContent = contents.find((content) => content.locale?.iso_code === currentLang);

    // 2. If not found, try to find content matching the default site language
    if (!selectedContent && defaultLangContent) {
      selectedContent = defaultLangContent;
    }

    // 3. If still not found, try to find English content
    if (!selectedContent) {
      selectedContent = contents.find((content) => content.locale?.iso_code === 'en');
    }

    // 4. If still not found, use the first content
    if (!selectedContent) {
      selectedContent = contents[0];
    }

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
      field: 'contents',
      headerName: t('Title'),
      width: 350,
      valueGetter: (params) => {
        const selectedContent = getContentForCurrentLanguage(params.row.contents);
        return selectedContent?.title || '-';
      },
      renderCell: (params) => <LinkedCell params={params}>{params.value}</LinkedCell>,
    },
    {
      field: 'slug',
      headerName: t('Slug'),
      width: 250,
      valueGetter: (params) => {
        const selectedContent = getContentForCurrentLanguage(params.row.contents);
        return selectedContent.slug;
      },
      renderCell: (params) => <LinkedCell params={params}>{params.value || '-'}</LinkedCell>,
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
        return (
          <div className="flex gap-1 flex-wrap">
            {contents.map((content, index) => (
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
      width: 90,
      renderCell: (params) => (
        <LinkedCell params={params}>
          <Checkbox checked={params.value} readOnly />
        </LinkedCell>
      ),
    },
    {
      field: 'actions',
      headerName: t('Actions'),
      width: 180,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <div onClick={(e) => e.stopPropagation()}>
          <FormActionsCell form={params.row} />
        </div>
      ),
    },
  ];

  return (
    <>
      <Helmet>
        <title>Pages</title>
      </Helmet>
      <main className="h-[calc(100vh-50px-32px-20px)] flex flex-col m-auto px-[12px] sm:px-[24px]">
        <div className="flex w-full justify-between gap-2 my-3">
          <H1 className="text-[32px] font-bold">{t('Forms')}</H1>
          <VisibilityControl
            roleIds={['super_admin_role', 'admin_role', 'website_admin_role']}
            render={false}
          >
            <Link to={`/forms/create`}>
              <Button
              >
                <FontAwesomeIcon icon={faPlus} className="sm:mr-1 h-4 w-4" />
                {t('')}
                <span className={`hidden sm:inline`}>{t('Create Form')}</span>
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
              ['admin_role', 'website_admin_role', 'website_editor_role'].includes(role.string_id),
            ) || false
          }
        />

        {error && (
          <Alert
            color="red"
            variant="light"
            title="Error"
            className="mb-4"
            icon={<FontAwesomeIcon icon={faTriangleExclamation} />}
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
          disableRowSelectionOnClick
          checkboxSelection
          className={`!border-0 `}
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
};

export default FormList;
