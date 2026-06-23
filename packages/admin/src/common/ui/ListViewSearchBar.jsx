import { useTranslation } from 'react-i18next';
import { Button as MantineButton } from '@mantine/core';
import TextInput from './TextInput.jsx';
import Button from './Button.jsx';
import NotificationState from '../stores/NotificationState.js';
import Chip from '@mui/material/Chip';
import { operatorLabels } from '../../constants/ormOperators.js';
import Select from './Select.jsx';
import { IconRefresh, IconSearch, IconX } from '@tabler/icons-react';

export default function ListViewSearchBar(props) {
  const { t } = useTranslation();
  const {
    query,
    allowSearch = true,
    allowDelete = true,
    selectedRows,
    setSelectedRows,
    slots,
    className,
    columns,
  } = props;
  const {
    modelName: model,
    searchTerm,
    setSearchTerm,
    filters,
    setFilters,
    deleteWithConfirm,
    get,
    exportCSV,
    importCSV,
    pageSize,
    setPageSize,
  } = query;
  const { notify } = NotificationState();

  function handleDelete() {
    deleteWithConfirm(
      selectedRows.map((row) => row.id),
      () => {
        setSelectedRows([]);
        get();
      },
    );
  }

  async function downloadSelectedRows() {
    try {
      if (selectedRows.length > 0) {
        const data = await exportCSV(selectedRows);
        return triggerDownload(data, `${model}.csv`);
      } else {
        notify({
          type: 'warning',
          message: t('No rows selected!'),
        });
      }
    } catch (e) {
      console.error(e);
      notify({
        type: 'error',
        message: e.message,
      });
    }
  }

  async function downloadAllRows() {
    try {
      const data = await exportCSV();
      return triggerDownload(data, `${model}.csv`);
    } catch (e) {
      notify({
        type: 'error',
        message: e.message,
      });
    }
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function uploadFile(file) {
    try {
      await importCSV(file);
      get();
      notify({
        type: 'success',
        message: t('Imported successfully!'),
      });
    } catch (e) {
      console.error(e);
      notify({
        type: 'error',
        message: e.message,
      });
    }
  }

  return (
    <>
      {/*Filter, actions row*/}
      <div
        className={`flex mb-3 min-h-[30px] items-end justify-between flex-wrap ${className || ''}`}
      >
        <div className={`flex items-center flex-wrap gap-2`}>
          <div className={`flex gap-2 items-center flex-wrap`}>
            {allowSearch && (
              <TextInput
                classNames={{ input: 'shadow-sm' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t(`Search...`)}
                leftSection={<IconSearch size={16} />}
                rightSection={
                  searchTerm && (
                    <IconX size={16} className="cursor-pointer" onClick={() => setSearchTerm('')} />
                  )
                }
              />
            )}
            {slots?.appendSearch && slots.appendSearch}
          </div>

          <div className={`flex gap-1 flex-wrap`}>
            {filters
              .filter((filter) => !filter.field?.includes('organization_id')) // Hide organization_id filter chips
              .map((filter, index) => {
                const fieldLabel =
                  columns?.find((col) => col.field === filter.field)?.headerName || filter.field;

                return (
                  <Chip
                    key={index}
                    // label={`${fieldLabel} ${operatorLabels[filter.operator].toLowerCase()} '${filter.value}'`}
                    label={
                      <>
                        <span className={`font-semibold`}>{fieldLabel}</span>
                        {` ${operatorLabels[filter.operator].toLowerCase()} '${filter.value}'`}
                      </>
                    }
                    onDelete={() => {
                      const index = filters.findIndex((f) => f === filter);
                      const newFilters = [...filters];
                      newFilters.splice(index, 1);
                      setFilters(newFilters);
                    }}
                  />
                );
              })}
          </div>

          {selectedRows?.length > 0 && allowDelete && (
            <div className={`flex items-center`}>
              <span className={`text-sm text-gray-500 mx-2`}>
                {`${selectedRows.length} ${t('selected')}`}
              </span>

              <Button size={`xs`} onClick={handleDelete} color={`red`}>
                <IconX size={18} className="mr-1" />
                {t('Delete')}
              </Button>
            </div>
          )}
        </div>

        <div className={`flex items-end gap-1`}>
          {slots?.prependButtons && slots.prependButtons}

          {/*<Group justify="center">*/}
          {/*  <FileButton onChange={uploadFile} accept=".csv">*/}
          {/*    {(props) => (*/}
          {/*      <MantineButton*/}
          {/*        {...props}*/}
          {/*        size={`xs`}*/}
          {/*        variant={`outline`}*/}
          {/*        className={`shadow`}*/}
          {/*        radius={`md`}*/}
          {/*      >*/}
          {/*        <IconUpload size={16} />*/}
          {/*      </MantineButton>*/}
          {/*    )}*/}
          {/*  </FileButton>*/}
          {/*</Group>*/}

          {/*/!*Export*!/*/}
          {/*<Menu shadow="md" width={200}>*/}
          {/*  <Menu.Target>*/}
          {/*    <Tooltip label="Export" withArrow>*/}
          {/*      <MantineButton*/}
          {/*        size={`xs`}*/}
          {/*        variant={`outline`}*/}
          {/*        className={`shadow`}*/}
          {/*        radius={`md`}*/}
          {/*      >*/}
          {/*        <IconFileDownload size={16} />*/}
          {/*      </MantineButton>*/}
          {/*    </Tooltip>*/}
          {/*  </Menu.Target>*/}

          {/*  <Menu.Dropdown>*/}
          {/*    <Menu.Label>Export</Menu.Label>*/}
          {/*    <a>*/}
          {/*      <Menu.Item onClick={downloadAllRows}>All results</Menu.Item>*/}
          {/*    </a>*/}
          {/*    <a>*/}
          {/*      <Menu.Item onClick={downloadSelectedRows}>*/}
          {/*        Selected rows*/}
          {/*      </Menu.Item>*/}
          {/*    </a>*/}
          {/*  </Menu.Dropdown>*/}
          {/*</Menu>*/}

          <MantineButton
            onClick={() => get()}
            size={`xs`}
            variant={`outline`}
            className={`shadow`}
            radius={`md`}
          >
            <IconRefresh size={16} />
          </MantineButton>

          {/*Page Size*/}
          <Select
            size={`xs`}
            classNames={{
              root: 'max-w-[63px]',
              input: 'shadow',
            }}
            data={['20', '30', '50', '100']}
            label={t(`Show max`)}
            value={pageSize?.toString()}
            onChange={(value) => setPageSize(parseInt(value))}
          />

          {slots?.appendButtons && slots.appendButtons}
        </div>
      </div>
    </>
  );
}
