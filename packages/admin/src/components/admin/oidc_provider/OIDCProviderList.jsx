import { useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import useModel from '../../../common/api/useModel.jsx';
import H1 from '../../../common/ui/H1.jsx';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet';
import { Alert, Badge } from '@mantine/core';
import ListViewSearchBar from '../../../common/ui/ListViewSearchBar.jsx';
import LinkedCell from '../../../common/ui/LinkedCell.jsx';
import DataGridColumnMenu from '../../../common/ui/DataGridColumnMenu.jsx';
import ListViewPagination from '../../../common/ui/ListViewPagination.jsx';
import { Link } from 'react-router-dom';
import Button from '../../../common/ui/Button.jsx';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';

export default function OIDCProviderList() {
  const { t } = useTranslation();
  const query = useModel('oidc_provider', {
    autoFetch: true,
    searchFields: ['issuer_url', 'display_name', 'adapter_name'],
    syncPagingParamsWithURL: true,
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
  } = query;
  const [selectedRows, setSelectedRows] = useState([]);

  const renderLinked = (params) => (
    <LinkedCell params={params} to={`/oidc-providers/${params.row.id}/edit`}>
      {params.value}
    </LinkedCell>
  );

  const columns = [
    {
      field: 'display_name',
      headerName: t('Name'),
      width: 200,
      renderCell: renderLinked,
    },
    {
      field: 'issuer_url',
      headerName: t('Issuer URL'),
      width: 320,
      renderCell: renderLinked,
    },
    {
      field: 'adapter_name',
      headerName: t('Adapter'),
      width: 120,
      renderCell: renderLinked,
    },
    {
      field: 'enabled',
      headerName: t('Enabled'),
      width: 110,
      renderCell: (params) => (
        <LinkedCell params={params} to={`/oidc-providers/${params.row.id}/edit`}>
          <Badge size="sm" variant="light" color={params.value ? 'green' : 'gray'}>
            {params.value ? t('Enabled') : t('Disabled')}
          </Badge>
        </LinkedCell>
      ),
    },
  ];

  return (
    <>
      <Helmet>
        <title>SSO Providers</title>
      </Helmet>
      <main className="h-[calc(100vh-50px-32px-20px)] flex flex-col m-auto px-[12px] sm:px-[24px]">
        <div className="flex w-full justify-between gap-2 my-3">
          <H1 className="text-[32px] font-bold">{t('SSO Providers')}</H1>
          <Link to={`/oidc-providers/create`}>
            <Button>
              <IconPlus size={16} className="sm:mr-1" />
              <span className={`hidden sm:inline`}>{t('Add Provider')}</span>
            </Button>
          </Link>
        </div>

        <ListViewSearchBar
          query={query}
          columns={columns}
          selectedRows={selectedRows}
          setSelectedRows={setSelectedRows}
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
          sortModel={[
            {
              field: orderBy.field,
              sort: orderBy.direction.toLowerCase(),
            },
          ]}
          onSortModelChange={(model) => {
            if (model.length > 0) {
              setOrderBy({
                field: model[0].field,
                direction: model[0].sort.toLowerCase(),
              });
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
