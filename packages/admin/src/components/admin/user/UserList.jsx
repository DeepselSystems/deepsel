import { useState, useCallback } from 'react';
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

  // Filter function to show only users belonging to the selected organization
  const filterByOrganization = useCallback(
    (user) => {
      if (!organizationId) return true; // Show all users if no organization selected
      return (
        user.organizations?.some((org) => org.id === organizationId) ||
        user.organizations.length === 0
      );
    },
    [organizationId],
  );

  const query = useModel('user', {
    autoFetch: true,
    searchFields: ['name'],
    syncPagingParamsWithURL: true,
    filterAfterLoad: organizationId ? filterByOrganization : null,
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
  const columns = [
    {
      field: 'image.name',
      headerName: t('Image'),
      sortable: false,
      valueGetter: (params) => params.row?.image?.name,
      width: 200,
      renderCell: (params) => (
        <LinkedCell params={params}>
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
      valueGetter: (params) =>
        Array.isArray(params.row?.roles)
          ? params.row.roles.map((item) => item.name).join(', ')
          : '',
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
      valueGetter: (params) =>
        Array.isArray(params.row?.organizations)
          ? params.row.organizations.map((item) => item.name).join(', ')
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
            <Button
            >
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
