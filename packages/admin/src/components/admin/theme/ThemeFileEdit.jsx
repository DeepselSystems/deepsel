import { useState, useEffect, useMemo, useCallback } from 'react';
import { Tabs, Tooltip, Menu, Modal, Loader } from '@mantine/core';
import { getFlagUrl } from '@deepsel/cms-utils/flags';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';

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
  const [buildError, setBuildError] = useState(null);
  const [activeContentTab, setActiveContentTab] = useState(null);
  const [addContentModalOpened, setAddContentModalOpened] = useState(false);
  const [selectedLocaleId, setSelectedLocaleId] = useState(null);

  const { data: locales } = useModel('locale', {
    autoFetch: true,
    pageSize: null,
  });

  useEffect(() => {
    setShowBackButton(true);
    return () => setShowBackButton(false);
  }, [setShowBackButton]);

  // Fetch file tree
  useEffect(() => {
    const fetchFileTree = async () => {
      try {
        const tokenResult = await Preferences.get({ key: 'token' });
        const headers = createApiHeaders(
          tokenResult?.value ? { Authorization: `Bearer ${tokenResult.value}` } : {},
        );

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
    };

    if (themeName) {
      fetchFileTree();
    }
  }, [themeName, backendHost, notify]);

  // Fetch file content when selected
  const fetchFileContent = useCallback(
    async (filePath, options = {}) => {
      const { preferredContent = null } = options;
      setLoading(true);
      try {
        const tokenResult = await Preferences.get({ key: 'token' });
        const headers = createApiHeaders(
          tokenResult?.value ? { Authorization: `Bearer ${tokenResult.value}` } : {},
        );

        const response = await fetch(`${backendHost}/theme/file/${themeName}/${filePath}`, {
          headers,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch file content');
        }

        const data = await response.json();
        setFileData(data);

        // Determine which tab should be active
        if (data.contents && data.contents.length > 0) {
          const desiredTab = (() => {
            if (!preferredContent) return null;

            const preferredId = String(preferredContent.id || 0);
            const byId = data.contents.find((content) => String(content.id || 0) === preferredId);
            if (byId) return String(byId.id || 0);

            if (preferredContent.locale_id) {
              const byLocale = data.contents.find(
                (content) => content.locale_id === preferredContent.locale_id,
              );
              if (byLocale) return String(byLocale.id || 0);
            }

            if (preferredContent.lang_code) {
              const byLang = data.contents.find(
                (content) => content.lang_code === preferredContent.lang_code,
              );
              if (byLang) return String(byLang.id || 0);
            }

            return null;
          })();

          const nextTab = desiredTab !== null ? desiredTab : String(data.contents[0].id || 0);
          setActiveContentTab(nextTab);
        } else {
          setActiveContentTab(null);
        }
      } catch (error) {
        console.error('Error fetching file content:', error);
        notify({ message: error.message, type: 'error' });
      } finally {
        setLoading(false);
      }
    },
    [themeName, backendHost, notify],
  );

  const handleSelectFile = (filePath) => {
    setSelectedFilePath(filePath);
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

  const activeContent = useMemo(() => {
    if (!fileData?.contents) return null;
    return fileData.contents.find((c) => String(c.id || 0) === activeContentTab);
  }, [fileData, activeContentTab]);

  const sortedContents = useMemo(() => {
    if (!fileData?.contents) return [];

    const defaults = fileData.contents.filter((content) => !content.lang_code);
    const localized = fileData.contents
      .filter((content) => content.lang_code)
      .slice()
      .sort((a, b) => {
        const isoA = a.locale?.iso_code || a.lang_code || '';
        const isoB = b.locale?.iso_code || b.lang_code || '';
        return isoA.localeCompare(isoB);
      });

    // Ensure only one default (if multiples exist they stay grouped at front)
    return [...defaults, ...localized];
  }, [fileData]);

  const updateContentField = (contentId, field, value) => {
    setFileData((prev) => ({
      ...prev,
      contents: prev.contents.map((c) =>
        String(c.id || 0) === String(contentId) ? { ...c, [field]: value } : c,
      ),
    }));
  };

  const handleAddContent = () => {
    setAddContentModalOpened(true);
  };

  const handleAddContentSubmit = () => {
    if (!selectedLocaleId) return;

    // Find the selected locale
    const locale = locales?.find((l) => l.id === selectedLocaleId);
    if (!locale) return;

    // Find default content (the one without lang_code)
    const defaultContent = fileData?.contents?.find((c) => !c.lang_code);

    // Create new content with temp ID, cloning from default content
    const newId = `new_${Date.now()}`;
    const newContent = {
      id: newId,
      content: defaultContent?.content || '',
      lang_code: locale.iso_code,
      locale_id: locale.id,
      locale: locale,
    };

    setFileData((prev) => ({
      ...prev,
      contents: [...prev.contents, newContent],
    }));

    setActiveContentTab(String(newId));
    setAddContentModalOpened(false);
    setSelectedLocaleId(null);
  };

  const handleDeleteContent = (contentId) => {
    setFileData((prev) => {
      const filtered = prev.contents.filter((c) => String(c.id || 0) !== String(contentId));

      // Switch to first remaining tab
      if (filtered.length > 0 && String(contentId) === activeContentTab) {
        setActiveContentTab(String(filtered[0].id || 0));
      }

      return { ...prev, contents: filtered };
    });
  };

  const handleSave = async () => {
    if (!fileData) return;

    setSaving(true);
    setBuildError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 660000);

    try {
      const tokenResult = await Preferences.get({ key: 'token' });
      const headers = createApiHeaders(
        tokenResult?.value ? { Authorization: `Bearer ${tokenResult.value}` } : {},
      );

      const payload = {
        theme_name: fileData.theme_name,
        file_path: fileData.file_path,
        contents: fileData.contents.map((c) => ({
          id: typeof c.id === 'string' && c.id.startsWith('new_') ? null : c.id,
          content: c.content,
          lang_code: c.lang_code,
          locale_id: c.locale_id,
        })),
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

      // Refresh file content to get updated IDs
      const preferredContent = activeContent || null;
      await fetchFileContent(fileData.file_path, { preferredContent });
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
                <h3 className="font-medium text-gray-900">{selectedFilePath}</h3>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSave}
                  disabled={saving || loading || !fileData}
                  loading={saving || loading}
                >
                  <IconDeviceFloppy size={16} className="mr-2" />
                  {saving ? t('Building...') : t('Save')}
                </Button>
              </div>
            </div>

            {/* Language Tabs */}
            {fileData && (
              <div className="flex-shrink-0 px-4">
                <Tabs
                  value={activeContentTab}
                  onChange={setActiveContentTab}
                  variant="pills"
                  radius="lg"
                >
                  <Tabs.List className="flex-wrap">
                    {sortedContents.map((content) => (
                      <div key={content.id || 0} className="relative group">
                        <Menu
                          shadow="md"
                          width={150}
                          position="bottom-end"
                          withArrow
                          radius="md"
                          trigger="hover"
                          openDelay={100}
                          closeDelay={400}
                        >
                          <Menu.Target>
                            <Tabs.Tab value={String(content.id || 0)} className="mr-1 mb-1">
                              {content.locale ? (
                                <>
                                  <img
                                    src={getFlagUrl(content.locale.iso_code)}
                                    alt={content.locale.name}
                                    className="h-4 w-auto rounded-sm inline-block mr-1"
                                  />
                                  {content.locale.name}
                                </>
                              ) : (
                                t('Default')
                              )}
                            </Tabs.Tab>
                          </Menu.Target>
                          {content.lang_code && (
                            <Menu.Dropdown>
                              <Menu.Item
                                color="red"
                                leftSection={<IconTrash size={16} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteContent(content.id || 0);
                                }}
                              >
                                {t('Remove')}
                              </Menu.Item>
                            </Menu.Dropdown>
                          )}
                        </Menu>
                      </div>
                    ))}

                    <Tooltip label={t('Add Language Version')}>
                      <Tabs.Tab
                        value="add_new"
                        onClick={(e) => {
                          e.preventDefault();
                          handleAddContent();
                        }}
                        className="bg-gray-100 hover:bg-gray-200"
                      >
                        <IconPlus size={16} />
                      </Tabs.Tab>
                    </Tooltip>
                  </Tabs.List>
                </Tabs>
              </div>
            )}

            {/* Code Editor */}
            {activeContent && (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="border border-gray-300 rounded-md overflow-hidden">
                  <Editor
                    className="w-full min-h-[600px]"
                    value={activeContent.content || ''}
                    onValueChange={(code) =>
                      updateContentField(activeContent.id || 0, 'content', code)
                    }
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
        opened={addContentModalOpened}
        onClose={() => {
          setAddContentModalOpened(false);
          setSelectedLocaleId(null);
        }}
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
          filters={
            fileData?.contents
              ?.filter((c) => c.locale_id)
              .map((content) => ({
                field: 'id',
                operator: '!=',
                value: content.locale_id,
              })) || []
          }
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => {
              setAddContentModalOpened(false);
              setSelectedLocaleId(null);
            }}
          >
            {t('Cancel')}
          </Button>
          <Button onClick={handleAddContentSubmit}>{t('Add')}</Button>
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
