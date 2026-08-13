import { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { getFlagUrl } from '@deepsel/cms-utils/flags';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import useModel from '../../../common/api/useModel.jsx';
import NotificationState from '../../../common/stores/NotificationState.js';
import ShowHeaderBackButtonState from '../../../common/stores/ShowHeaderBackButtonState.js';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import Button from '../../../common/ui/Button.jsx';
import RecordSelect from '../../../common/ui/RecordSelect.jsx';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-css';
import 'prismjs/themes/prism.css';
import { Preferences } from '@capacitor/preferences';
import { createApiHeaders } from '../../../utils/apiUtils.js';
import {
  IconChevronDown,
  IconChevronRight,
  IconDeviceFloppy,
  IconFile,
  IconFolder,
  IconLanguage,
  IconTrash,
} from '@tabler/icons-react';

// Matches the specifier of `import ... from '<spec>'`, `export ... from '<spec>'`,
// `import '<spec>'` and dynamic `import('<spec>')`, for relative specifiers only.
const RELATIVE_IMPORT_PATTERN = /((?:\bfrom|\bimport)\s*\(?\s*)(['"])(\.{1,2}\/[^'"]*)\2/g;

/**
 * Push relative import specifiers one directory level deeper.
 * `./x` -> `../x`, `../x` -> `../../x`. Each specifier is rewritten exactly once
 * (single replace pass), so no double-rewriting can happen.
 */
function deepenRelativeImports(code) {
  if (!code) return code;
  return code.replace(RELATIVE_IMPORT_PATTERN, (match, prefix, quote, specifier) => {
    const deeper = specifier.startsWith('../') ? `../${specifier}` : `../${specifier.slice(2)}`;
    return `${prefix}${quote}${deeper}${quote}`;
  });
}

function FileTreeNode({ node, onSelectFile, selectedPath, level = 0 }) {
  const [isExpanded, setIsExpanded] = useState(level === 0);

  if (node.is_directory) {
    return (
      <div>
        <div
          className="flex items-center py-1 px-2 hover:bg-gray-100 cursor-pointer"
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <IconChevronDown size={18} className="mr-2 text-gray-500" />
          ) : (
            <IconChevronRight size={18} className="mr-2 text-gray-500" />
          )}
          <IconFolder size={16} className="mr-2 text-yellow-500" />
          <span className="text-sm">{node.name}</span>
        </div>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child, idx) => (
              <FileTreeNode
                key={idx}
                node={child}
                onSelectFile={onSelectFile}
                selectedPath={selectedPath}
                level={level + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center py-1 px-2 hover:bg-gray-100 cursor-pointer ${
        selectedPath === node.path ? 'bg-blue-50' : ''
      }`}
      style={{ paddingLeft: `${level * 16 + 24}px` }}
      onClick={() => onSelectFile(node.path)}
    >
      <IconFile size={16} className="mr-2 text-gray-400" />
      <span className="text-sm">{node.name}</span>
    </div>
  );
}

export default function ThemeFileEdit() {
  const { t } = useTranslation();
  const { themeName } = useParams();
  const [searchParams] = useSearchParams();
  const { notify } = NotificationState();
  const { backendHost } = BackendHostURLState();
  const { setShowBackButton } = ShowHeaderBackButtonState();

  const [fileTree, setFileTree] = useState([]);
  const [selectedFilePath, setSelectedFilePath] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [buildError, setBuildError] = useState(null);
  const [addLanguageModalOpened, setAddLanguageModalOpened] = useState(false);
  const [selectedLocaleId, setSelectedLocaleId] = useState(null);
  // Local "new file" mode: the file does not exist on disk nor in the DB yet.
  const [isNewFile, setIsNewFile] = useState(false);
  const [importsAdjusted, setImportsAdjusted] = useState(false);

  const { data: locales } = useModel('locale', {
    autoFetch: true,
    pageSize: null,
  });

  const langCodes = useMemo(
    () => (locales || []).map((locale) => (locale.iso_code || '').toLowerCase()).filter(Boolean),
    [locales],
  );

  useEffect(() => {
    setShowBackButton(true);
    return () => setShowBackButton(false);
  }, [setShowBackButton]);

  const buildHeaders = useCallback(async () => {
    const tokenResult = await Preferences.get({ key: 'token' });
    return createApiHeaders(
      tokenResult?.value ? { Authorization: `Bearer ${tokenResult.value}` } : {},
    );
  }, []);

  // Fetch file tree
  const fetchFileTree = useCallback(async () => {
    try {
      const headers = await buildHeaders();

      const response = await fetch(`${backendHost}/theme/files/${themeName}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch file tree');
      }

      const data = await response.json();
      setFileTree(data);
    } catch (error) {
      console.error('Error fetching file tree:', error);
      notify({ message: error.message, type: 'error' });
    }
  }, [themeName, backendHost, notify, buildHeaders]);

  useEffect(() => {
    if (themeName) {
      fetchFileTree();
    }
  }, [themeName, fetchFileTree]);

  // Fetch file content when selected
  const fetchFileContent = useCallback(
    async (filePath) => {
      setLoading(true);
      try {
        const headers = await buildHeaders();

        const response = await fetch(`${backendHost}/theme/file/${themeName}/${filePath}`, {
          headers,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch file content');
        }

        const data = await response.json();
        setFileData(data);
        setIsNewFile(false);
      } catch (error) {
        console.error('Error fetching file content:', error);
        notify({ message: error.message, type: 'error' });
      } finally {
        setLoading(false);
      }
    },
    [themeName, backendHost, notify, buildHeaders],
  );

  const handleSelectFile = (filePath) => {
    setSelectedFilePath(filePath);
    setImportsAdjusted(false);
    fetchFileContent(filePath);
  };

  // Auto-select file from ?file= query param after tree loads
  useEffect(() => {
    const fileParam = searchParams.get('file');
    if (fileParam && fileTree.length > 0 && !selectedFilePath) {
      handleSelectFile(fileParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileTree, searchParams]);

  const activeContent = fileData?.contents?.[0] || null;

  // The current path with any leading language segment stripped
  // (`de/index.astro` -> `index.astro`, `index.astro` -> `index.astro`).
  const basePath = useMemo(() => {
    if (!selectedFilePath) return '';
    const segments = selectedFilePath.split('/');
    if (segments.length > 1 && langCodes.includes(segments[0].toLowerCase())) {
      return segments.slice(1).join('/');
    }
    return selectedFilePath;
  }, [selectedFilePath, langCodes]);

  const isAtThemeRoot = !!selectedFilePath && basePath === selectedFilePath;
  const canDeleteFile = !isNewFile && fileData?.exists_on_disk === false;

  const updateContent = (value) => {
    setFileData((prev) => {
      if (!prev) return prev;
      const current = prev.contents?.[0] || { id: null };
      return { ...prev, contents: [{ ...current, content: value }] };
    });
  };

  const handleAddLanguage = () => {
    setAddLanguageModalOpened(true);
  };

  const closeAddLanguageModal = () => {
    setAddLanguageModalOpened(false);
    setSelectedLocaleId(null);
  };

  // Creates a new file path `<lang>/<basePath>` prefilled with the current content.
  const handleAddLanguageSubmit = () => {
    if (!selectedLocaleId || !selectedFilePath) return;

    const locale = locales?.find((l) => l.id === selectedLocaleId);
    if (!locale?.iso_code) return;

    const newFilePath = `${locale.iso_code}/${basePath}`;

    if (newFilePath === selectedFilePath) {
      notify({
        message: t('This file is already the {{language}} version.', { language: locale.name }),
        type: 'error',
      });
      return;
    }

    const sourceContent = activeContent?.content || '';
    // Only rewrite when going from theme root into a lang folder (one level deeper).
    // Lang folder -> lang folder keeps the same depth, so specifiers stay valid.
    const newContent = isAtThemeRoot ? deepenRelativeImports(sourceContent) : sourceContent;

    setSelectedFilePath(newFilePath);
    setFileData({
      theme_name: themeName,
      file_path: newFilePath,
      exists_on_disk: false,
      contents: [{ id: null, content: newContent }],
    });
    setIsNewFile(true);
    setImportsAdjusted(isAtThemeRoot && newContent !== sourceContent);
    closeAddLanguageModal();
  };

  const handleSave = async () => {
    if (!fileData) return;

    setSaving(true);
    setBuildError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 660000);

    try {
      const headers = await buildHeaders();

      const payload = {
        theme_name: fileData.theme_name || themeName,
        file_path: fileData.file_path,
        contents: [
          {
            id: activeContent?.id ?? null,
            content: activeContent?.content || '',
          },
        ],
      };

      const response = await fetch(`${backendHost}/theme/file/save`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        const detail = errorData.detail || 'Failed to save file';
        if (response.status === 422) {
          setBuildError(detail);
          return;
        }
        throw new Error(detail);
      }

      notify({
        message: t('File saved and built successfully!'),
        type: 'success',
      });

      setImportsAdjusted(false);

      // Refresh the tree (a newly created file appears there) and the content (IDs).
      await fetchFileTree();
      await fetchFileContent(fileData.file_path);
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Error saving file:', error);
      if (error.name === 'AbortError') {
        notify({
          message: t('Build timed out. Please check the server logs.'),
          type: 'error',
          duration: 10000,
        });
      } else {
        notify({ message: error.message, type: 'error', duration: 10000 });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFile = () => {
    if (!selectedFilePath) return;

    modals.openConfirmModal({
      title: t('Delete File'),
      children: (
        <Text size="sm">
          {t(
            'This file only exists in the database. Deleting it removes it permanently and rebuilds the site. This action cannot be undone.',
          )}
        </Text>
      ),
      labels: { confirm: t('Delete'), cancel: t('Cancel') },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        setDeleting(true);
        try {
          const headers = await buildHeaders();

          const response = await fetch(
            `${backendHost}/theme/file/${themeName}/${selectedFilePath}`,
            {
              method: 'DELETE',
              headers,
            },
          );

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to delete file');
          }

          notify({ message: t('File deleted successfully'), type: 'success' });

          // Back to the file tree view
          setSelectedFilePath(null);
          setFileData(null);
          setIsNewFile(false);
          setImportsAdjusted(false);
          await fetchFileTree();
        } catch (error) {
          console.error('Error deleting file:', error);
          notify({ message: error.message, type: 'error', duration: 10000 });
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  // Determine syntax highlighting based on file extension
  const getLanguage = (filePath) => {
    if (!filePath) return languages.markup;
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) return languages.jsx;
    if (filePath.endsWith('.ts') || filePath.endsWith('.js')) return languages.javascript;
    if (filePath.endsWith('.css')) return languages.css;
    if (filePath.endsWith('.astro')) return languages.markup;
    return languages.markup;
  };

  return (
    <div className="h-screen w-full flex overflow-hidden">
      {/* File Tree - Left Side */}
      <div className="w-64 border border-gray-200 overflow-y-auto bg-gray-50 rounded-lg">
        <div className="p-3 border-b border-gray-200 bg-white">
          <h2 className="font-semibold text-gray-700">{themeName}</h2>
        </div>
        <div className="py-2">
          {fileTree.map((node, idx) => (
            <FileTreeNode
              key={idx}
              node={node}
              onSelectFile={handleSelectFile}
              selectedPath={selectedFilePath}
            />
          ))}
        </div>
      </div>

      {/* Editor - Right Side */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedFilePath ? (
          <>
            {/* Header */}
            <div className="flex-shrink-0 px-4 border-gray-200 bg-white flex justify-between items-center">
              <div>
                <h3 className="font-medium text-gray-900">
                  {selectedFilePath}
                  {isNewFile && (
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {t('New file - not saved yet')}
                    </span>
                  )}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={handleAddLanguage}
                  disabled={saving || loading || deleting || !fileData}
                >
                  <IconLanguage size={16} className="mr-2" />
                  {t('Add Language Version')}
                </Button>
                {canDeleteFile && (
                  <Button
                    variant="outline"
                    color="red"
                    onClick={handleDeleteFile}
                    disabled={saving || loading || deleting}
                    loading={deleting}
                  >
                    <IconTrash size={16} className="mr-2" />
                    {t('Delete file')}
                  </Button>
                )}
                <Button
                  onClick={handleSave}
                  disabled={saving || loading || deleting || !fileData}
                  loading={saving || loading}
                >
                  <IconDeviceFloppy size={16} className="mr-2" />
                  {saving ? t('Building...') : t('Save')}
                </Button>
              </div>
            </div>

            {importsAdjusted && (
              <div className="flex-shrink-0 mx-4 mt-2 px-3 py-2 rounded-md bg-yellow-50 text-yellow-900 text-xs">
                {t(
                  'Relative imports were automatically adjusted one level deeper for this language folder. Please review them before saving.',
                )}
              </div>
            )}

            {/* Code Editor */}
            {activeContent && (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="border border-gray-300 rounded-md overflow-hidden">
                  <Editor
                    className="w-full min-h-[600px]"
                    value={activeContent.content || ''}
                    onValueChange={updateContent}
                    highlight={(code) => highlight(code, getLanguage(selectedFilePath), 'jsx')}
                    padding={12}
                    style={{
                      fontSize: 14,
                      backgroundColor: '#f8f9fa',
                      fontFamily: '"Fira code", "Fira Mono", "Consolas", monospace',
                      lineHeight: '1.5',
                    }}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            {t('Select a file to edit')}
          </div>
        )}
      </div>

      {/* Add Language Modal */}
      <Modal
        opened={addLanguageModalOpened}
        onClose={closeAddLanguageModal}
        title={t('Add Language Version')}
      >
        <RecordSelect
          label={t('Select Language')}
          placeholder={t('Choose a language')}
          model="locale"
          displayField="name"
          pageSize={1000}
          searchFields={['name', 'iso_code']}
          value={selectedLocaleId}
          onChange={setSelectedLocaleId}
          renderOption={(locale) => (
            <span>
              <img
                src={getFlagUrl(locale.iso_code)}
                alt={locale.name}
                className="h-4 w-auto rounded-sm inline-block"
              />{' '}
              {locale.name}
            </span>
          )}
        />
        <p className="text-xs text-gray-500 mt-3">
          {t('A new file will be created at')} <code>&lt;lang&gt;/{basePath}</code>{' '}
          {t('with a copy of the current content.')}
          {isAtThemeRoot &&
            ` ${t('Relative imports are adjusted one level deeper automatically - please review them before saving.')}`}
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={closeAddLanguageModal}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleAddLanguageSubmit}>{t('Add')}</Button>
        </div>
      </Modal>

      {/* Build Error Modal */}
      <Modal
        opened={!!buildError}
        onClose={() => setBuildError(null)}
        title={t('Build Failed')}
        size="xl"
      >
        <p className="text-sm text-gray-600 mb-3">
          {t('The build failed. No changes were saved. Please fix the error and try again.')}
        </p>
        <pre className="text-xs bg-red-50 text-red-900 p-4 rounded overflow-auto max-h-96 whitespace-pre-wrap">
          {buildError}
        </pre>
        <div className="flex justify-end mt-4">
          <Button onClick={() => setBuildError(null)}>{t('Close')}</Button>
        </div>
      </Modal>
    </div>
  );
}
