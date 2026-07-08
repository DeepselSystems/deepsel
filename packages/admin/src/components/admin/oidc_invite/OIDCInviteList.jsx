import { useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
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
import dayjs from 'dayjs';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';

const renderText = (params) => <LinkedCell params={params}>{params.value}</LinkedCell>;

export default function OIDCInviteList() {
  const { t } = useTranslation();
  const query = useModel('pending_invite', {
    autoFetch: true,
    searchFields: ['email'],
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

  const columns = [
    {
      field: 'email',
      headerName: t('Email'),
      width: 240,
      renderCell: renderText,
    },
    {
      field: 'roles',
      headerName: t('Roles'),
      sortable: false,
      width: 280,
      valueGetter: (params) =>
        Array.isArray(params.row?.roles) ? params.row.roles.map((r) => r.name).join(', ') : '',
      renderCell: (params) => (
        <div className="flex gap-1 items-center flex-wrap py-1">
          {params.row?.roles?.map((r) => (
            <Chip size="xs" key={r.id} variant="outline">
              {r.name}
            </Chip>
          ))}
        </div>
      ),
    },
    {
      field: 'expires_at',
      headerName: t('Expires'),
      width: 180,
      renderCell: (params) => (
        <LinkedCell params={params}>
          {params.value ? dayjs(params.value).format('YYYY-MM-DD HH:mm') : ''}
        </LinkedCell>
      ),
    },
    {
      field: 'accepted_at',
      headerName: t('Status'),
      width: 140,
      renderCell: (params) => (
        <Chip size="xs" variant="outline" color={params.value ? 'green' : 'yellow'}>
          {params.value ? t('Accepted') : t('Pending')}
        </Chip>
      ),
    },
  ];

  return (
    <>
      <Helmet>
        <title>SSO Invites</title>
      </Helmet>
      <main className="h-[calc(100vh-50px-32px-20px)] flex flex-col m-auto px-[12px] sm:px-[24px]">
        <div className="flex w-full justify-between gap-2 my-3">
          <H1 className="text-[32px] font-bold">{t('SSO Invites')}</H1>
          <Link to={`/oidc-invites/create`}>
            <Button>
              <IconPlus size={16} className="sm:mr-1" />
              <span className={`hidden sm:inline`}>{t('Create Invite')}</span>
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
