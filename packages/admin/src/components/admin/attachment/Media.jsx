import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Checkbox, Switch, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import useModel from '../../../common/api/useModel.jsx';
import useFetch from '../../../common/api/useFetch.js';
import Button from '../../../common/ui/Button.jsx';
import NotificationState from '../../../common/stores/NotificationState.js';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import useAuthentication from '../../../common/api/useAuthentication.js';
import useEffectOnce from '../../../common/hooks/useEffectOnce.js';
import H1 from '../../../common/ui/H1.jsx';
import { Helmet } from 'react-helmet';
import { IconSearch, IconServer, IconTrash, IconX } from '@tabler/icons-react';
import useShowSiteSelector from '../../../common/hooks/useShowSiteSelector.js';
import { MediaDropzone } from '../../../common/ui/attachment/MediaDropzone.jsx';
import { AttachmentCard } from '../../../common/ui/attachment/AttachmentCard.jsx';
import orderBy from 'lodash/orderBy';

/** Fields searched via backend OR query when the user types in the search input. */
const SEARCH_FIELDS = ['name', 'locale_versions.name', 'locale_versions.alt_text'];

/** Delay in ms before the debounced search term is forwarded to the backend. */
const SEARCH_DEBOUNCE_MS = 300;

export default function Media() {
  useShowSiteSelector();
  const { t } = useTranslation();
  const { user } = useAuthentication();
  const { notify } = NotificationState((state) => state);
  const { backendHost } = BackendHostURLState((state) => state);

  const filters = [
    {
      field: 'owner_id',
      operator: '=',
      value: user.id,
    },
  ];

  const [rawSearch, setRawSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(rawSearch, SEARCH_DEBOUNCE_MS);

  const {
    data: files,
    setData: setFiles,
    deleteWithConfirm,
    setSearchTerm,
  } = useModel('attachment', {
    pageSize: null,
    autoFetch: true,
    filters,
    searchFields: SEARCH_FIELDS,
  });

  const { record: unusedResult, get: fetchUnusedFiles } = useFetch('attachment/unused/list', {
    autoFetch: false,
    params: {},
  });

  const unusedFiles = unusedResult?.data ?? null;

  const [newUploads, setNewUploads] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showUnused, setShowUnused] = useState(false);
  const [storageInfo, setStorageInfo] = useState({
    usedStorage: 0,
    maxStorage: null,
    unit: 'MB',
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch storage info from backend
  const fetchStorageInfo = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${backendHost}/attachment/storage/info`);
      const data = await response.json();
      setStorageInfo({
        usedStorage: data.used_storage,
        maxStorage: data.max_storage,
        unit: data.unit,
      });
    } catch (error) {
      console.error('Error fetching storage info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Format storage info for display
  const formatStorageInfo = () => {
    const { usedStorage, maxStorage, unit } = storageInfo;
    const formattedUsedStorage = parseFloat(usedStorage).toFixed(2);
    if (maxStorage === null) {
      return `${formattedUsedStorage} ${unit} ${t('used')}`;
    }
    const percentUsed = Math.round((usedStorage / maxStorage) * 100);
    return `${formattedUsedStorage} ${t('of')} ${maxStorage} ${unit} (${percentUsed}%)`;
  };

  /** Toggle "Show unused" — fetch on enable, clear on disable. */
  const handleToggleUnused = (checked) => {
    setShowUnused(checked);
    setSelectedIds(new Set());
    if (checked) {
      fetchUnusedFiles();
    }
  };

  const handleFilesUploaded = (filesArray) => {
    filesArray.forEach((uploadedFile) => {
      setNewUploads((prev) => new Set([...prev, uploadedFile.id]));
      setFiles((prevFiles) => [...prevFiles, uploadedFile]);
    });
  };

  // Toggle file selection
  const toggleSelect = (file) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(file.id)) next.delete(file.id);
      else next.add(file.id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const sortedFiles = useMemo(() => {
    let source = showUnused ? (unusedFiles ?? []) : files;
    if (showUnused && debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      source = source.filter(
        (f) =>
          f.name?.toLowerCase().includes(q) ||
          f.locale_versions?.some(
            (v) => v.name?.toLowerCase().includes(q) || v.alt_text?.toLowerCase().includes(q),
          ),
      );
    }
    return sortFilesWithNewUploadsFirst(source, newUploads);
  }, [files, unusedFiles, showUnused, newUploads, debouncedSearch]);

  const allSelected = sortedFiles.length > 0 && selectedIds.size === sortedFiles.length;
  const selectAll = () => {
    if (allSelected) clearSelection();
    else setSelectedIds(new Set(sortedFiles.map((f) => f.id)));
  };

  const handleAttachmentUpdated = (updated) => {
    setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      await deleteWithConfirm(
        ids,
        () => {
          setNewUploads((prev) => {
            const updated = new Set(prev);
            ids.forEach((id) => updated.delete(id));
            return updated;
          });
          setFiles((prevFiles) => prevFiles.filter((f) => !selectedIds.has(f.id)));
          clearSelection();
          notify({
            title: t('Success'),
            message: t('Files deleted successfully'),
            type: 'success',
          });
          fetchStorageInfo();
        },
        (error) => {
          console.error('Error deleting files:', error);
          notify({
            title: t('Error'),
            message: error.message || t('Failed to delete files'),
            type: 'error',
          });
        },
      );
    } catch (error) {
      console.error('Unexpected error in handleBulkDelete:', error);
    }
  };

  const handleDelete = async (attachment) => {
    try {
      await deleteWithConfirm(
        [attachment.id],
        () => {
          if (newUploads.has(attachment.id)) {
            setNewUploads((prev) => {
              const updated = new Set(prev);
              updated.delete(attachment.id);
              return updated;
            });
          }
          setFiles((prevAttachments) => prevAttachments.filter((a) => a.id !== attachment.id));
          notify({
            title: t('Success'),
            message: t('File deleted successfully'),
            type: 'success',
          });
          fetchStorageInfo();
        },
        (error) => {
          console.error('Error deleting attachment:', error);
          notify({
            title: t('Error'),
            message: error.message || t('Failed to delete file'),
            type: 'error',
          });
        },
      );
    } catch (error) {
      console.error('Unexpected error in handleDelete:', error);
    }
  };

  // Sort files with new uploads first
  function sortFilesWithNewUploadsFirst(files, newUploads) {
    if (!files) return [];
    return orderBy(files, [(f) => newUploads.has(f.id)], ['desc']);
  }

  // Fetch storage information on component mount
  useEffectOnce(() => {
    fetchStorageInfo().then();
  }, []);

  // Forward debounced search term to backend only in normal mode; unused mode filters client-side
  useEffect(() => {
    if (!showUnused) {
      setSearchTerm(debouncedSearch);
    }
  }, [debouncedSearch, setSearchTerm, showUnused]);

  return (
    <>
      <Helmet>
        <title>{t('Media Library')}</title>
      </Helmet>
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-4">
          <H1>{t('Media Library')}</H1>
          <div className="flex items-center text-sm bg-gray-100 px-3 py-2 rounded-md">
            <IconServer size={16} className="mr-2 text-primary-main" />
            {isLoading ? t('Loading storage info...') : formatStorageInfo()}
          </div>
        </div>

        <MediaDropzone onFilesUploaded={handleFilesUploaded} onStorageChange={fetchStorageInfo} />

        <div className="flex items-center gap-3 mb-3">
          <TextInput
            placeholder={t('Search by file name or alt text...')}
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            leftSection={<IconSearch size={16} />}
            rightSection={
              rawSearch ? (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={() => setRawSearch('')}
                  aria-label={t('Clear search')}
                >
                  <IconX size={14} />
                </ActionIcon>
              ) : null
            }
            className="flex-1"
          />
          <Switch
            label={t('Show unused')}
            checked={showUnused}
            onChange={(e) => handleToggleUnused(e.currentTarget.checked)}
            size="sm"
          />
        </div>

        {sortedFiles.length > 0 && (
          <div className="flex items-center justify-between mb-3 px-3 py-2 bg-gray-50 rounded-md border border-gray-200">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={allSelected}
                indeterminate={selectedIds.size > 0 && !allSelected}
                onChange={selectAll}
                label={
                  selectedIds.size > 0
                    ? t('{{count}} selected', { count: selectedIds.size })
                    : t('Select all')
                }
              />
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <Button onClick={clearSelection} size="xs" variant="default">
                  {t('Cancel')}
                </Button>
                <Button onClick={handleBulkDelete} size="xs" color="red" variant="filled">
                  <IconTrash size={16} className="mr-1" />
                  {t('Delete')} ({selectedIds.size})
                </Button>
              </div>
            )}
          </div>
        )}

        {sortedFiles.length === 0 && showUnused && !debouncedSearch && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
            <IconSearch size={36} />
            <Text size="sm">{t('All attachments are in use.')}</Text>
          </div>
        )}

        {sortedFiles.length === 0 && debouncedSearch && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
            <IconSearch size={36} />
            <Text size="sm">{t('No files match "{{query}}"', { query: debouncedSearch })}</Text>
            <Button variant="subtle" size="xs" onClick={() => setRawSearch('')}>
              {t('Clear search')}
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {sortedFiles.map((attachment, index) => (
            <AttachmentCard
              key={attachment.id || index}
              attachment={attachment}
              onDelete={handleDelete}
              selected={selectedIds.has(attachment.id)}
              onToggleSelect={toggleSelect}
              selectionMode={selectedIds.size > 0}
              onAttachmentUpdated={handleAttachmentUpdated}
            />
          ))}
        </div>
      </div>
    </>
  );
}
