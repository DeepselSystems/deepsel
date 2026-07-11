import { useEffect, useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { getFlagUrl } from '@deepsel/cms-utils/flags';
import useModel from '../../../common/api/useModel.jsx';
import useAuthentication from '../../../common/api/useAuthentication.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import H1 from '../../../common/ui/H1.jsx';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { Alert, Box } from '@mantine/core';
import ListViewSearchBar from '../../../common/ui/ListViewSearchBar.jsx';
import DataGridColumnMenu from '../../../common/ui/DataGridColumnMenu.jsx';
import ListViewPagination from '../../../common/ui/ListViewPagination.jsx';
import dayjs from 'dayjs';
import LinkedCell from '../../../common/ui/LinkedCell.jsx';
import RecordSelect from '../../../common/ui/RecordSelect.jsx';

const FormSubmissionList = () => {
  const { t } = useTranslation();
  const { user } = useAuthentication();
  const { organizationId } = OrganizationIdState();
  const query = useModel('form_submission', {
    autoFetch: true,
    searchFields: ['form_content.title', 'submitter_user_agent'],
    syncPagingParamsWithURL: true,
    orderBy: { field: 'id', direction: 'desc' },
    filters: organizationId
      ? [
          {
            field: 'form.organization_id',
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
    filters,
    setFilters,
  } = query;
  const [selectedRows, setSelectedRows] = useState([]);
  const [selectedFormId, setSelectedFormId] = useState(
    filters?.find((o) => o.field === 'form_content_id')?.value || null,
  );

  /**
   * Update filters when searching value changes
   */
  useEffect(() => {
    setFilters([
      ...(organizationId
        ? [
            {
              field: 'form.organization_id',
              operator: '=',
              value: organizationId,
            },
          ]
        : []),
      ...(selectedFormId
        ? [
            {
              field: 'form_content_id',
              operator: '=',
              value: selectedFormId,
            },
          ]
        : []),
    ]);
  }, [organizationId, selectedFormId, setFilters]);

  // Function to get the appropriate content based on current language
  const columns = [
    {
      field: 'id',
      headerName: '#',
      width: 80,
      renderCell: (params) => <strong>#{params.value}</strong>,
    },
    {
      field: 'form_content.title',
      headerName: t('Form'),
      width: 350,
      renderCell: (params) => (
        <LinkedCell params={params}>
          <Box className="truncate" title={params.row.form_content.title}>
            {params.row.form_content.title}
          </Box>
        </LinkedCell>
      ),
    },
    {
      field: 'form_content.locale.name',
      headerName: t('Locale'),
      width: 350,
      renderCell: (params) => (
        <LinkedCell params={params}>
          <Box className="flex gap-2">
            <Box className="truncate">
              <img
                src={getFlagUrl(params.row.form_content.locale.iso_code)}
                alt={params.row.form_content.locale.name}
                className="h-4 w-auto rounded-sm inline-block"
              />
            </Box>
            <Box className="truncate">{params.row.form_content.locale.name}</Box>
          </Box>
        </LinkedCell>
      ),
    },
    {
      field: 'updated_at',
      headerName: t('Submitted'),
      width: 350,
      renderCell: (params) => (
        <LinkedCell params={params}>
          <Box params={params}>
            {dayjs
              .utc(params.value)
              .tz(Intl.DateTimeFormat().resolvedOptions().timeZone)
              .format('D MMM YYYY HH:mm') +
              ` (${Intl.DateTimeFormat().resolvedOptions().timeZone})`}
          </Box>
        </LinkedCell>
      ),
    },
  ];

  return (
    <>
      <Helmet>
        <title>{t('Form submissions')}</title>
      </Helmet>
      <main className="h-[calc(100vh-50px-32px-20px)] flex flex-col m-auto px-3 sm:px-6">
        <div className="flex w-full justify-between gap-2 my-3">
          <H1 className="text-[32px] font-bold">{t('Form submissions')}</H1>
        </div>

        <Box className="flex gap-6 items-end ">
          <RecordSelect
            className="max-w-xs mb-3"
            model="form_content"
            displayField="title"
            searchFields={['title']}
            placeholder={t('Select a form')}
            required
            value={selectedFormId}
            onChange={setSelectedFormId}
            renderOption={(option) => (
              <p>
                <img
                  src={getFlagUrl(option.locale.iso_code)}
                  alt={option.locale.name}
                  className="h-4 w-auto rounded-sm inline-block mr-3"
                />
                <span>{option.title}</span>
              </p>
            )}
            filter={{
              id: {
                // $nin: record.contents.map((t) => t.locale_id).filter(Boolean),
              },
            }}
          />
          <Box className="flex-1">
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
          </Box>
        </Box>

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

export default FormSubmissionList;
