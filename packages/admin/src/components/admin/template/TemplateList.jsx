import { useState, useEffect } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { getFlagUrl } from '@deepsel/cms-utils/flags';
import useModel from '../../../common/api/useModel.jsx';
import useAuthentication from '../../../common/api/useAuthentication.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import H1 from '../../../common/ui/H1.jsx';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet';

import { Alert } from '@mantine/core';
import ListViewSearchBar from '../../../common/ui/ListViewSearchBar.jsx';
import LinkedCell from '../../../common/ui/LinkedCell.jsx';
import DataGridColumnMenu from '../../../common/ui/DataGridColumnMenu.jsx';
import ListViewPagination from '../../../common/ui/ListViewPagination.jsx';
import { Link } from 'react-router-dom';
import Button from '../../../common/ui/Button.jsx';
import VisibilityControl from '../../../common/auth/VisibilityControl.jsx';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import useShowSiteSelector from '../../../common/hooks/useShowSiteSelector.js';

export default function TemplateList() {
  useShowSiteSelector();
  const { t } = useTranslation();
  const { user } = useAuthentication();
  const { organizationId } = OrganizationIdState();
  const query = useModel('template', {
    autoFetch: true,
    searchFields: ['name'],
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
  const [selectedRows, setSelectedRows] = useState([]);

  // Update filters when organizationId changes
  useEffect(() => {
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

  const columns = [
    {
      field: 'id',
      headerName: '#',
      width: 80,
      renderCell: (params) => <strong>#{params.value}</strong>,
    },
    {
      field: 'name',
      headerName: t('Name'),
      width: 350,
      valueGetter: (params) => {
        return params.row.name || '-';
      },
      renderCell: (params) => {
        return (
          <LinkedCell params={params} to={`/templates/${params.row.id}/edit`}>
            {params.value}
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
  ];

  return (
    <>
      <Helmet>
        <title>Templates</title>
      </Helmet>
      <main className="h-[calc(100vh-50px-32px-20px)] flex flex-col m-auto px-[12px] sm:px-[24px]">
        <div className="flex w-full justify-between gap-2 my-3">
          <H1 className="text-[32px] font-bold text-primary">{t('Templates')}</H1>
          <Link to={`/templates/create`}>
            <Button
            >
              <IconPlus size={16} className="sm:mr-1" />
              {t('')}
              <span className={`hidden sm:inline`}>{t('Create Template')}</span>
            </Button>
          </Link>
        </div>

        <ListViewSearchBar
          query={query}
          columns={columns}
          selectedRows={selectedRows}
          setSelectedRows={setSelectedRows}
          allowDelete={
            user.roles.find((role) =>
              ['admin_role', 'super_admin_role', 'website_admin_role'].includes(role.string_id),
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
}
