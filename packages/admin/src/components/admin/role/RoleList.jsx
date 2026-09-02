import { useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import useGridServerFilter, {
  buildGridFilterFieldMap,
  withDefaultGridFilterOperators,
} from '../../../common/hooks/useGridServerFilter.js';
import useModel from '../../../common/api/useModel.jsx';
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
import Chip from '../../../common/ui/Chip.jsx';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';

export default function RoleList() {
  const { t } = useTranslation();
  const query = useModel('role', {
    autoFetch: true,
    searchFields: ['name'],
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
    filters,
    setFilters,
  } = query;
  const [selectedRows, setSelectedRows] = useState([]);

  const columns = [
    {
      field: 'name',
      headerName: t('Name'),
      width: 200,
      renderCell: (params) => <LinkedCell params={params}>{params.value}</LinkedCell>,
    },
    {
      field: 'description',
      headerName: t('Description'),
      width: 200,
      renderCell: (params) => <LinkedCell params={params}>{params.value}</LinkedCell>,
    },
    {
      field: 'organization',
      headerName: t('Organization'),
      sortable: false,
      // Single relation — a real filterable path on the backend
      filterField: 'organization.name',
      valueGetter: (value, row) => row?.organization?.name ?? '',
      width: 200,
      renderCell: (params) => (
        <LinkedCell params={params}>
          <div className="flex gap-1 items-center flex-wrap">
            {params.row?.organization && (
              <Chip size="xs" variant="outline">
                {params.row.organization.name}
              </Chip>
            )}
          </div>
        </LinkedCell>
      ),
    },
    {
      field: 'implied_roles',
      headerName: t('Implied Roles'),
      sortable: false,
      // Many-to-many, comma-joined display — no single backend field to filter by
      filterable: false,
      valueGetter: (value, row) =>
        Array.isArray(row?.implied_roles)
          ? row.implied_roles.map((item) => item.name).join(', ')
          : '',
      width: 300,
      renderCell: (params) => (
        <LinkedCell params={params}>
          <div className={`flex gap-1 items-center flex-wrap`}>
            {params.row?.implied_roles?.map((item) => (
              <Chip size={`xs`} key={item.id} variant="outline">
                {item.name}
              </Chip>
            ))}
          </div>
        </LinkedCell>
      ),
    },
  ].map(withDefaultGridFilterOperators);

  const { handleFilterModelChange } = useGridServerFilter({
    filters,
    setFilters,
    fieldMap: buildGridFilterFieldMap(columns),
  });

  return (
    <>
      <Helmet>
        <title>Roles</title>
      </Helmet>
      <main className="h-[calc(100vh-50px-32px-20px)] flex flex-col m-auto px-[12px] sm:px-[24px]">
        <div className="flex w-full justify-between gap-2 my-3">
          <H1 className="text-8 font-bold">{t('Roles')}</H1>
          <Link to="/roles/create">
            <Button>
              <IconPlus size={16} className="sm:mr-1" />
              <span className={`hidden sm:inline`}>{t('Create Role')}</span>
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
          onFilterModelChange={handleFilterModelChange}
        />

        <ListViewPagination query={query} />
      </main>
    </>
  );
}
