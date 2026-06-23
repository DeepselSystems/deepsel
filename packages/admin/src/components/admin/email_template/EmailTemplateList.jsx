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
import dayjs from 'dayjs';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';

const renderCell = (params) => <LinkedCell params={params}>{params.value}</LinkedCell>;

export default function EmailTemplateList() {
  const { t } = useTranslation();
  const query = useModel('email_template', {
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
  } = query;
  const [selectedRows, setSelectedRows] = useState([]);

  const columns = [
    {
      field: 'name',
      headerName: t('Name'),
      flex: 2,
      minWidth: 200,
      renderCell: (params) => <LinkedCell params={params}>{params.value}</LinkedCell>,
    },
    {
      field: 'subject',
      headerName: t('Subject'),
      flex: 3,
      minWidth: 300,
      renderCell: (params) => <LinkedCell params={params}>{params.value}</LinkedCell>,
    },
    {
      field: 'created_at',
      headerName: t('Created'),
      flex: 1.5,
      minWidth: 150,
      renderCell: (params) => (
        <LinkedCell params={params}>
          {dayjs.utc(params.value).local().format('DD/MM/YYYY HH:mm')}
        </LinkedCell>
      ),
    },
  ];

  return (
    <>
      <Helmet>
        <title>Email Templates</title>
      </Helmet>
      <main className="h-[calc(100vh-50px-32px-20px)] flex flex-col m-auto px-[12px] sm:px-[24px]">
        <div className="flex w-full justify-between gap-2 my-3">
          <H1 className="text-[32px] font-bold text-primary">{t('Email Templates')}</H1>
          <Link to={`/email_templates/create`}>
            <Button
              className={`shadow bg-primary-main text-primary-contrastText`}
              color={`primary`}
            >
              <IconPlus size={16} className="sm:mr-1" />
              {t('')}
              <span className={`hidden sm:inline`}>{t('Create Email Template')}</span>
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
