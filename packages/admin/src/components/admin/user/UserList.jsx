import { useState, useEffect } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import useModel from '../../../common/api/useModel.jsx';
import H1 from '../../../common/ui/H1.jsx';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Alert, Avatar } from '@mantine/core';
import ListViewSearchBar from '../../../common/ui/ListViewSearchBar.jsx';
import LinkedCell from '../../../common/ui/LinkedCell.jsx';
import DataGridColumnMenu from '../../../common/ui/DataGridColumnMenu.jsx';
import ListViewPagination from '../../../common/ui/ListViewPagination.jsx';
import { Link } from 'react-router-dom';
import Button from '../../../common/ui/Button.jsx';
import Chip from '../../../common/ui/Chip.jsx';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import { getAttachmentByNameRelativeUrl } from '@deepsel/cms-utils';

export default function UserList() {
  const { t } = useTranslation();
  const location = useLocation();
  const { organizationId } = OrganizationIdState();

  const query = useModel('user', {
    autoFetch: true,
    searchFields: ['name'],
    syncPagingParamsWithURL: true,
    filters: organizationId
      ? [{ field: 'organizations.id', operator: '=', value: organizationId }]
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

  // Re-scope the users list to the selected organization on the server,
  // since filtering happens before pagination there
  useEffect(() => {
    setFilters(
      organizationId ? [{ field: 'organizations.id', operator: '=', value: organizationId }] : [],
    );
  }, [organizationId, setFilters]);

  const [selectedRows, setSelectedRows] = useState([]);
  const columns = [
    {
      field: 'image.name',
      headerName: t('Image'),
      sortable: false,
      valueGetter: (value, row) => row?.image?.name,
      width: 200,
      renderCell: (params) => (
        <LinkedCell className="block mt-1.5" params={params}>
          <Avatar
            name={params.row?.image?.name || ''}
            color="initials"
            src={
              params.row?.image?.name
                ? getAttachmentByNameRelativeUrl(params.row?.image?.name)
                : null
            }
            size="md"
          />
        </LinkedCell>
      ),
    },
    {
      field: 'username',
      headerName: t('Username'),
      width: 200,
      renderCell: (params) => <LinkedCell params={params}>{params.value}</LinkedCell>,
    },
    {
      field: 'name',
      headerName: t('Name'),
      width: 200,
      renderCell: (params) => <LinkedCell params={params}>{params.value}</LinkedCell>,
    },
    {
      field: 'roles',
      headerName: t('Roles'),
      sortable: false,
      valueGetter: (value, row) =>
        Array.isArray(row?.roles) ? row.roles.map((item) => item.name).join(', ') : '',
      width: 200,
      renderCell: (params) => (
        <LinkedCell params={params}>
          <div className={`flex gap-1 items-center flex-wrap`}>
            {params.row?.roles?.map((item) => (
              <Chip size={`xs`} key={item.id} variant="outline">
                {item.name}
              </Chip>
            ))}
          </div>
        </LinkedCell>
      ),
    },
    {
      field: 'organizations',
      headerName: t('Organizations'),
      sortable: false,
      valueGetter: (value, row) =>
        Array.isArray(row?.organizations)
          ? row.organizations.map((item) => item.name).join(', ')
          : '',
      width: 200,
      renderCell: (params) => (
        <LinkedCell params={params}>
          <div className={`flex gap-1 items-center flex-wrap`}>
            {params.row?.organizations?.map((item) => (
              <Chip size={`xs`} key={item.id} variant="outline">
                {item.name}
              </Chip>
            ))}
          </div>
        </LinkedCell>
      ),
    },
  ];

  return (
    <>
      <Helmet>
        <title>Users</title>
      </Helmet>
      <main className="h-[calc(100vh-50px-32px-20px)] flex flex-col m-auto px-[12px] sm:px-[24px]">
        <div className="flex w-full justify-between gap-2 my-3">
          <H1 className="text-[32px] font-bold">{t('Users')}</H1>
          <Link to={location.pathname === `/users` ? `/users/create` : `/manage-users/create`}>
            <Button>
              <IconPlus size={16} className="sm:mr-1" />
              {t('')}
              <span className={`hidden sm:inline`}>{t('Create User')}</span>
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
          paginationModel={{ page: page - 1, pageSize }}
          onPaginationModelChange={(model) => {
            if (model.pageSize !== pageSize) setPageSize(model.pageSize);
            if (model.page !== page - 1) setPage(model.page + 1);
          }}
          pageSizeOptions={[20, 30, 50, 100]}
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
          onRowSelectionModelChange={(ids) => {
            setSelectedRows(items.filter((item) => ids.includes(item.id)));
          }}
          slots={{
            columnMenu: DataGridColumnMenu,
            footer: () => null,
          }}
          slotProps={{ columnMenu: { query } }}
          localeText={{ noRowsLabel: t('Nothing here yet.') }}
        />

        <ListViewPagination query={query} />
      </main>
    </>
  );
}
