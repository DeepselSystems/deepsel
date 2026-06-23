import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { LoadingOverlay, Modal, Tabs, Tooltip, Menu, Drawer, Accordion } from '@mantine/core';
import Button from '../../../common/ui/Button.jsx';
import { useDisclosure } from '@mantine/hooks';
import ChooseAttachmentModal from '../../../common/ui/ChooseAttachmentModal.jsx';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import useModel from '../../../common/api/useModel.jsx';
import NotificationState from '../../../common/stores/NotificationState.js';
import SitePublicSettingsState from '../../../common/stores/SitePublicSettingsState.js';
import ShowHeaderBackButtonState from '../../../common/stores/ShowHeaderBackButtonState.js';
import HideHeaderItemsState from '../../../common/stores/HideHeaderItemsState.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import UserState from '../../../common/stores/UserState.js';
import useSidebar from '../../../common/hooks/useSidebar.js';
import FormViewSkeleton from '../../../common/ui/FormViewSkeleton.jsx';
import RecordSelect from '../../../common/ui/RecordSelect.jsx';
import RichTextInput from '../../../common/ui/RichTextInput.jsx';
import Switch from '../../../common/ui/Switch.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';
import DateTimePickerInput from '../../../common/ui/DateTimePickerInput.jsx';
import useMultiLangContent from '../../../common/hooks/useMultiLangContent.js';
import SeoMetadataForm from '../../../common/ui/SeoMetadata/SeoMetadataForm.jsx';
import AuthorSelector from './components/AuthorSelector.jsx';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-jsx';
import 'prismjs/themes/prism.css';
import H2 from '../../../common/ui/H2.jsx';
import useEditSession from '../../../common/hooks/useEditSession.js';
import useDraftAutosave from '../../../common/hooks/useDraftAutosave.js';
import ActiveEditorsAvatars from '../../../common/ui/ActiveEditorsAvatars.jsx';
import PublishStatusMenu from '../../../common/ui/PublishStatusMenu.jsx';
import AIWriterSidebar from '../../../common/ui/AIWriterSidebar.jsx';
import RevisionsModal from '../../../common/ui/RevisionsModal/index.jsx';
import {
  IconAi,
  IconCloudCheck,
  IconCloudUpload,
  IconPencil,
  IconPhotoPlus,
  IconPlus,
  IconSettings,
  IconSparkles2,
  IconSubtitlesAi,
  IconTrash,
} from '@tabler/icons-react';
import { getAttachmentByNameRelativeUrl } from '@deepsel/cms-utils/common/utils';

const BLOG_POST_DRAFT_FIELDS = [
  'title',
  'subtitle',
  'content',
  'reading_length',
  'featured_image_id',
  'seo_metadata_title',
  'seo_metadata_description',
  'seo_metadata_featured_image_id',
  'seo_metadata_allow_indexing',
  'custom_code',
];

/**
 * Overlay draft_* values onto the live fields so the editor always renders the
 * "working copy". Runs once per loaded record (keyed by id).
 */
function applyDraftOverlayToContents(contents) {
  if (!contents?.length) return contents;
  return contents.map((c) => {
    if (!c.has_draft) return c;
    const merged = { ...c };
    for (const field of BLOG_POST_DRAFT_FIELDS) {
      const draftVal = c[`draft_${field}`];
      if (draftVal !== null && draftVal !== undefined) merged[field] = draftVal;
    }
    if (c.draft_featured_image) merged.featured_image = c.draft_featured_image;
    if (c.draft_seo_metadata_featured_image)
      merged.seo_metadata_featured_image = c.draft_seo_metadata_featured_image;
    return merged;
  });
}

export default function BlogPostEdit() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { notify } = NotificationState((state) => state);
  const siteSettings = SitePublicSettingsState((state) => state.settings);
  const { setShowBackButton } = ShowHeaderBackButtonState();
  const { setHideNotifications, setHideSiteSelector, setHideGoToSite } = HideHeaderItemsState();
  const { organizationId } = OrganizationIdState();
  const { user } = UserState();
  const { isCollapsed, temporaryCollapse, clearTemporaryOverride } = useSidebar();

  const initialSidebarStateRef = useRef(null);
  const sidebarInitializedRef = useRef(false);

  // Determine if this is create mode (no id) or edit mode (has id)
  const isCreateMode = !id;

  // Initialize record for create mode
  const [createRecord, setCreateRecord] = useState({
    title: '',
    content: '',
    reading_length: '',
    published: false,
    slug: '',
    contents: [],
    author_id: user?.id || null,
    publish_date: new Date(),
  });

  // Single useModel query for both modes
  const query = useModel('blog_post', { id, autoFetch: !!id });

  // Use create record for create mode, query record for edit mode
  const record = isCreateMode ? createRecord : query.record;
  const setRecord = isCreateMode ? setCreateRecord : query.setRecord;
  const { update, create, loading, getOne } = query;

  const { data: locales } = useModel('locale', {
    autoFetch: true,
    pageSize: null,
  });

  // Used to persist newly added language contents in edit mode (see effect below).
  const blogPostContentModel = useModel('blog_post_content', { autoFetch: false });

  // Use the centralized multi-language content hook
  const {
    activeContentTab,
    setActiveContentTab,
    selectedLocaleId,
    setSelectedLocaleId,
    addingLanguage,
    addContentModalOpened,
    closeAddContentModal,
    settingsDrawerOpened,
    openSettingsDrawer,
    closeSettingsDrawer,
    getLanguageName,
    getLanguageFlag,
    handleAddContent,
    handleAddContentSubmit,
    handleDeleteContent,
    updateContentField,
    processContentsForSubmit,
    validateContents,
  } = useMultiLangContent({
    initialRecord: record,
    setRecord,
    locales,
    siteSettings,
    autoTranslate: true,
    contentType: 'blog_post',
    onBeforeDelete: async (content) => {
      // Skip DB delete for frontend-only rows (not yet persisted). Otherwise
      // delete the real BlogPostContent row so it doesn't linger server-side.
      if (isCreateMode || !content?.id || content._addNew) return;
      await blogPostContentModel.del(content.id);
    },
  });

  /**
   * Active content, that based on active tab
   * @type {BlogPostContent}
   */
  const activeContent = useMemo(
    () => record?.contents?.find((c) => String(c.id) === activeContentTab),
    [activeContentTab, record?.contents],
  );

  const sortedContents = useMemo(() => {
    const defaultLangId = siteSettings?.default_language?.id;
    return [...(record?.contents || [])].sort((a, b) => {
      if (a.locale_id === defaultLangId && b.locale_id !== defaultLangId) return -1;
      if (b.locale_id === defaultLangId && a.locale_id !== defaultLangId) return 1;
      return getLanguageName(a.locale_id).localeCompare(getLanguageName(b.locale_id));
    });
  }, [record?.contents, siteSettings?.default_language?.id, getLanguageName]);

  // Presence + live draft sync
  const { activeEditors, onDraftSaved, onPublished } = useEditSession(
    'blog_post',
    isCreateMode ? null : id,
    null,
  );

  const draftOverlayAppliedForIdRef = useRef(null);
  // True once the draft overlay effect has run — prevents autosave from firing
  // before overlaid draft values are captured as the baseline.
  const [overlayReady, setOverlayReady] = useState(isCreateMode);
  const [aiAutocompleteEnabled, setAiAutocompleteEnabled] = useState(true);
  const [aiWriterSidebarOpened, setAiWriterSidebarOpened] = useState(false);
  const [revisionsModalOpened, setRevisionsModalOpened] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [
    featuredImageModalOpened,
    { open: openFeaturedImageModal, close: closeFeaturedImageModal },
  ] = useDisclosure(false);
  const isAiFeatureAvailable =
    !!siteSettings?.has_openrouter_api_key && !!siteSettings?.ai_autocomplete_model_id;
  const aiWritingAvailable =
    !!siteSettings?.has_openrouter_api_key && !!siteSettings?.ai_default_writing_model_id;
  const aiRequirementMessage = t(
    'Please specify an API key and autocomplete model in Site Settings to use this feature.',
  );

  // Reset overlayReady when navigating to a different blog post record.
  useEffect(() => {
    if (!isCreateMode) setOverlayReady(false);
  }, [id, isCreateMode]);

  // Overlay draft_* onto live fields once per loaded record so the editor shows the working copy.
  // We must bump editorKey so RichTextInput (TipTap) remounts with the draft content —
  // it only reads its `content` prop on mount.
  useEffect(() => {
    if (isCreateMode || !record?.id) return;
    if (draftOverlayAppliedForIdRef.current === record.id) return;
    draftOverlayAppliedForIdRef.current = record.id;
    const overlaid = applyDraftOverlayToContents(record.contents);
    if (overlaid !== record.contents) {
      setRecord({ ...record, contents: overlaid });
      setEditorKey((k) => k + 1);
    }
    // Signal that the overlay is done — autosave may now enable.
    setOverlayReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, isCreateMode]);

  const buildContentsPayload = useCallback(() => {
    return (record?.contents || [])
      .filter((c) => c.id != null && !c._addNew)
      .map((c) => ({
        content_id: c.id,
        title: c.title,
        subtitle: c.subtitle,
        content: c.content,
        reading_length: c.reading_length,
        featured_image_id: c.featured_image_id,
        seo_metadata_title: c.seo_metadata_title,
        seo_metadata_description: c.seo_metadata_description,
        seo_metadata_featured_image_id: c.seo_metadata_featured_image_id,
        seo_metadata_allow_indexing: c.seo_metadata_allow_indexing,
        custom_code: c.custom_code,
      }));
  }, [record?.contents]);

  const autosave = useDraftAutosave({
    recordType: 'blog_post',
    recordId: isCreateMode ? null : id,
    enabled: !isCreateMode && !!record?.id && overlayReady,
    buildContentsPayload,
  });

  // When a new language is added to an existing post, the hook only tracks it in
  // local state with a frontend-only id. We need a real BlogPostContent row so
  // autosave/publish can target it. Create with empty live fields — anything the
  // user typed (or the auto-translation) flows into draft_* via the autosave once
  // the real id replaces the fake one.
  const persistingNewContentRef = useRef(new Set());
  useEffect(() => {
    if (isCreateMode || !record?.id) return;
    const newContent = record.contents?.find(
      (c) => c._addNew && !persistingNewContentRef.current.has(c.id),
    );
    if (!newContent) return;
    persistingNewContentRef.current.add(newContent.id);

    (async () => {
      try {
        const created = await blogPostContentModel.create({
          post_id: record.id,
          locale_id: newContent.locale_id,
          title: '',
          organization_id: organizationId,
        });
        if (!created?.id) return;
        setRecord((prev) => {
          if (!prev?.contents) return prev;
          return {
            ...prev,
            contents: prev.contents.map((c) => {
              if (c.id !== newContent.id) return c;
              // eslint-disable-next-line no-unused-vars
              const { _addNew, ...rest } = c;
              return {
                ...rest,
                id: created.id,
                published: false,
                last_modified_at: null,
                has_draft: false,
              };
            }),
          };
        });
        setActiveContentTab((cur) => (cur === String(newContent.id) ? String(created.id) : cur));
      } catch (err) {
        console.error('Failed to persist new language content:', err);
        notify({ message: err.message, type: 'error' });
        persistingNewContentRef.current.delete(newContent.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.contents, isCreateMode, record?.id]);

  // Merge incoming peer drafts into local state; guard against echo saves.
  useEffect(() => {
    onDraftSaved((data) => {
      if (!data?.contents?.length) return;
      autosave.suppressNext();
      setRecord((prev) => {
        if (!prev?.contents) return prev;
        return {
          ...prev,
          contents: prev.contents.map((c) => {
            const incoming = data.contents.find((ic) => ic.content_id === c.id);
            if (!incoming) return c;
            const merged = { ...c, has_draft: true };
            for (const field of BLOG_POST_DRAFT_FIELDS) {
              const v = incoming[`draft_${field}`];
              if (v !== null && v !== undefined) merged[field] = v;
            }
            return merged;
          }),
        };
      });
      // Remount RichTextInput so it shows the peer's updated content.
      setEditorKey((k) => k + 1);
    });
    onPublished(async () => {
      // Someone else just published — reload to get the fresh live fields.
      if (!isCreateMode) {
        draftOverlayAppliedForIdRef.current = null;
        await getOne(id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-collapse sidebar on mount
  useEffect(() => {
    if (!sidebarInitializedRef.current) {
      initialSidebarStateRef.current = isCollapsed;
      sidebarInitializedRef.current = true;
      if (!isCollapsed) {
        temporaryCollapse();
      }
    }
  }, [isCollapsed, temporaryCollapse]);

  // Restore sidebar state on unmount
  useEffect(() => {
    return () => {
      clearTemporaryOverride();
    };
  }, [clearTemporaryOverride]);

  // Enable back button and hide header items on mount, restore on unmount
  useEffect(() => {
    setShowBackButton(true);
    setHideNotifications(true);
    setHideSiteSelector(true);
    setHideGoToSite(true);
    return () => {
      setShowBackButton(false);
      setHideNotifications(false);
      setHideSiteSelector(false);
      setHideGoToSite(false);
    };
  }, [setShowBackButton, setHideNotifications, setHideSiteSelector, setHideGoToSite]);

  // Generate a slug from a title (used in create mode). Returns '' when the
  // title yields no usable characters so callers decide the fallback instead
  // of silently producing '/' and colliding with the homepage.
  const generateSlug = (title) => {
    if (!title) return '';
    const slug = title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) return '';
    return slug.startsWith('/') ? slug : `/${slug}`;
  };

  // Create mode still uses the full POST; draft autosave only runs in edit mode.
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      const processedContents = processContentsForSubmit(record.contents);
      validateContents(processedContents);

      const recordToSave = {
        ...record,
        published: false,
        contents: processedContents.map((content) => ({
          ...content,
          seo_metadata_title: content.seo_metadata_title || content.title,
        })),
      };

      if (!recordToSave.slug && recordToSave.contents.length > 0) {
        // Derive from the first locale content that has a title.
        for (const c of recordToSave.contents) {
          const candidate = generateSlug(c.title);
          if (candidate) {
            recordToSave.slug = candidate;
            break;
          }
        }
      }
      if (recordToSave.slug && !recordToSave.slug.startsWith('/')) {
        recordToSave.slug = `/${recordToSave.slug}`;
      }
      if (!recordToSave.slug) {
        throw new Error(t('Please enter a title or slug for this blog post before saving.'));
      }

      await create({ ...recordToSave, organization_id: organizationId });
      notify({ message: t('Draft saved!'), type: 'success' });
      navigate(-1);
    } catch (error) {
      console.error(error);
      notify({ message: error.message, type: 'error' });
    }
  };

  const flushDraftBeforePublish = async () => {
    const contents = buildContentsPayload();
    if (contents.length) await autosave.flushNow?.(contents);
  };

  const refetchAfterChange = async () => {
    // Disable autosave before refetching so the incoming content does not look like
    // a user edit. The disabled→enabled transition resets the autosave baseline via
    // useDraftAutosave's enabled-off effect, ensuring the fresh data is captured as
    // the new baseline without scheduling a save.
    setOverlayReady(false);
    // The overlay useEffect is keyed on record.id and won't re-run for a refetch
    // of the same record, so we apply it manually here to keep any still-pending
    // per-language drafts visible (e.g. after reverting only the active language).
    const fresh = await getOne(id);
    if (fresh?.contents) {
      const overlaid = applyDraftOverlayToContents(fresh.contents);
      setRecord({ ...fresh, contents: overlaid });
      setEditorKey((k) => k + 1);
      draftOverlayAppliedForIdRef.current = fresh.id;
      setOverlayReady(true);
    }
  };

  // Snapshot parent-level settings when the drawer opens so we can detect on close
  // whether anything changed. Content-level fields (SEO, per-lang custom_code) flow
  // through autosave already; parent fields have no draft column, so we persist
  // them directly via update() if dirty.
  const settingsSnapshotRef = useRef(null);
  const snapshotSettings = () =>
    JSON.stringify({
      author_id: record?.author_id ?? null,
      publish_date: record?.publish_date ?? null,
      slug: record?.slug ?? '',
      require_login: record?.require_login ?? false,
      blog_post_custom_code: record?.blog_post_custom_code ?? '',
    });

  const handleOpenSettingsDrawer = () => {
    settingsSnapshotRef.current = snapshotSettings();
    openSettingsDrawer();
  };

  const handleCloseSettingsDrawer = async () => {
    closeSettingsDrawer();
    if (isCreateMode || !record?.id) return;

    const pendingContents = buildContentsPayload();
    if (pendingContents.length) await autosave.flushNow?.(pendingContents);

    if (snapshotSettings() === settingsSnapshotRef.current) return;
    try {
      await update({
        id: record.id,
        author_id: record.author_id,
        publish_date: record.publish_date,
        slug: record.slug,
        require_login: record.require_login,
        blog_post_custom_code: record.blog_post_custom_code,
      });
    } catch (error) {
      console.error(error);
      notify({ message: error.message, type: 'error' });
    }
  };

  const autosaveLabel = (() => {
    if (isCreateMode) return null;
    if (autosave.status === 'saving') return t('Saving…');
    if (autosave.status === 'error') return t('Save failed');
    if (autosave.status === 'saved' && autosave.savedAt) {
      return t('Saved {{time}}', {
        time: autosave.savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    }
    return null;
  })();

  return isCreateMode || (!loading && record) ? (
    <>
      <div className="w-full flex overflow-y-auto" style={{ height: 'calc(100dvh - 70px)' }}>
        <form
          className={`flex-1 max-w-screen-xl m-auto px-[24px]`}
          onSubmit={isCreateMode ? handleCreateSubmit : (e) => e.preventDefault()}
        >
          <div className="mt-4">
            <LoadingOverlay
              visible={loading}
              zIndex={1000}
              overlayProps={{ radius: 'sm', blur: 2 }}
              loaderProps={{ type: 'bars' }}
            />

            <Tabs
              value={activeContentTab}
              onChange={setActiveContentTab}
              variant="pills"
              radius="lg"
            >
              <div className="flex justify-between items-center mb-2">
                <Tabs.List className="flex-wrap">
                  {sortedContents.map((content) => (
                    <div key={content.id} className="relative group">
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
                          <Tabs.Tab value={String(content.id)}>
                            <span className="mr-1">{getLanguageFlag(content.locale_id)}</span>
                            {getLanguageName(content.locale_id)}
                          </Tabs.Tab>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={16} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteContent(content.id);
                            }}
                          >
                            {t('Remove')}
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </div>
                  ))}

                  <Tooltip label={t('Add language')}>
                    <button
                      type="button"
                      onClick={handleAddContent}
                      className="border border-dashed px-2 rounded-xl border-gray-300 hover:bg-gray-200"
                    >
                      <IconPlus size={16} />
                    </button>
                  </Tooltip>
                </Tabs.List>
                <div className="flex items-center gap-2">
                  <ActiveEditorsAvatars editors={activeEditors} />
                  {autosaveLabel && (
                    <span className="text-xs text-gray-500 inline-flex items-center gap-1 mr-1">
                      {autosave.status === 'saving' ? (
                        <IconCloudUpload size={14} />
                      ) : (
                        <IconCloudCheck size={14} />
                      )}
                      {autosaveLabel}
                    </span>
                  )}
                  <PublishStatusMenu
                    recordType="blog_post"
                    record={record}
                    isCreateMode={isCreateMode}
                    activeContent={activeContent}
                    siteSettings={siteSettings}
                    typeLabel={t('Blog post')}
                    publicUrlPrefix="/blog"
                    parentFields={{
                      slug: record?.slug,
                      publish_date: record?.publish_date,
                      author_id: record?.author_id,
                      require_login: record?.require_login,
                      blog_post_custom_code: record?.blog_post_custom_code,
                    }}
                    flushDraft={flushDraftBeforePublish}
                    onAfterPublish={refetchAfterChange}
                    onAfterUnpublish={refetchAfterChange}
                    onAfterRevert={refetchAfterChange}
                    onOpenRevisions={() => setRevisionsModalOpened(true)}
                  />
                  <Menu shadow="md" width={250} position="bottom-end" withArrow radius="md">
                    <Menu.Target>
                      <Button variant="subtle" size="md" className="px-2">
                        <IconAi size={40} />
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item closeMenuOnClick={false}>
                        <Tooltip
                          label={t(
                            'Please specify an API key and writing model in Site Settings to use this feature.',
                          )}
                          disabled={aiWritingAvailable}
                        >
                          <div className="inline-flex items-center">
                            <Switch
                              label={
                                <span className="inline-flex items-center gap-1">
                                  <IconSparkles2 size={16} />
                                  {t('AI Writer')}
                                </span>
                              }
                              checked={aiWriterSidebarOpened}
                              onChange={(e) => setAiWriterSidebarOpened(e.currentTarget.checked)}
                              disabled={!aiWritingAvailable}
                              size="md"
                            />
                          </div>
                        </Tooltip>
                      </Menu.Item>
                      <Menu.Item closeMenuOnClick={false}>
                        <Tooltip label={aiRequirementMessage} disabled={isAiFeatureAvailable}>
                          <div className="inline-flex items-center">
                            <Switch
                              label={
                                <span className="inline-flex items-center gap-1">
                                  <IconSubtitlesAi size={16} />
                                  {t('AI Autocomplete')}
                                </span>
                              }
                              checked={aiAutocompleteEnabled && isAiFeatureAvailable}
                              onChange={(e) => setAiAutocompleteEnabled(e.currentTarget.checked)}
                              disabled={!isAiFeatureAvailable}
                              size="md"
                            />
                          </div>
                        </Tooltip>
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                  {isCreateMode && (
                    <Button
                      className="text-[14px] font-[600]"
                      disabled={loading}
                      loading={loading}
                      variant="filled"
                      type="submit"
                      color="green"
                    >
                      {t('Save draft')}
                    </Button>
                  )}
                  <Tooltip label={t('Settings')}>
                    <Button
                      variant="subtle"
                      size="md"
                      onClick={handleOpenSettingsDrawer}
                      className="px-2"
                    >
                      <IconSettings size={20} />
                    </Button>
                  </Tooltip>
                </div>
              </div>

              {record?.contents?.length > 0 ? (
                record.contents.map((content) => (
                  <Tabs.Panel key={content.id} value={String(content.id)}>
                    {content.featured_image ? (
                      <div className="w-full my-4 relative group cursor-pointer">
                        <img
                          src={getAttachmentByNameRelativeUrl(
                            content.featured_image.name,
                            activeContent?.locale.iso_code,
                          )}
                          alt={content.title || 'Featured image'}
                          className="w-full h-auto object-cover rounded-md max-h-[400px]"
                        />
                        <div className="absolute inset-0 backdrop-blur-sm bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3 rounded-md">
                          <Button variant="filled" size="sm" onClick={openFeaturedImageModal}>
                            <IconPencil size={16} className="mr-2" />
                            {t('Change')}
                          </Button>
                          <Button
                            variant="filled"
                            color="red"
                            size="sm"
                            onClick={() => {
                              updateContentField(content.id, 'featured_image', null);
                              updateContentField(content.id, 'featured_image_id', null);
                            }}
                          >
                            <IconTrash size={16} className="mr-2" />
                            {t('Remove')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="w-full mt-6 cursor-pointer hover:text-green-600 transition-colors flex gap-2 text-gray-500"
                        onClick={openFeaturedImageModal}
                      >
                        <IconPhotoPlus size={20} className="text-xl" />
                        <span className="font-medium">{t('Add featured image')}</span>
                      </div>
                    )}
                    <div className="flex gap-4 my-2">
                      <div className="flex flex-col grow gap-2">
                        <TextInput
                          className="w-full"
                          classNames={{ input: 'font-bold text-[42px]' }}
                          placeholder={t('Enter a title...')}
                          size="xl"
                          variant="unstyled"
                          required
                          value={content.title || ''}
                          onChange={(e) => updateContentField(content.id, 'title', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="my-4">
                      <RichTextInput
                        key={`editor-${content.id}-${editorKey}`}
                        variant="subtle"
                        content={content.content || ''}
                        locale={content.locale}
                        onChange={(value) => {
                          updateContentField(content.id, 'content', value);
                        }}
                        classNames={{
                          root: 'border-none',
                          content: 'min-h-[1000px]',
                        }}
                        autoComplete={aiAutocompleteEnabled && isAiFeatureAvailable}
                      />
                    </div>
                  </Tabs.Panel>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">{t('Nothing here yet.')}</div>
              )}
            </Tabs>
          </div>
        </form>
        <AIWriterSidebar
          opened={aiWriterSidebarOpened}
          onClose={() => setAiWriterSidebarOpened(false)}
          activeContent={activeContent}
          updateContentField={updateContentField}
          onContentInserted={() => setEditorKey((k) => k + 1)}
          contentType="blog"
        />
      </div>

      {/* Add Language Modal */}
      <Modal
        opened={addContentModalOpened}
        onClose={closeAddContentModal}
        title={<div className="font-bold">{t('Add Content')}</div>}
        size="md"
        radius={0}
        transitionProps={{ transition: 'fade', duration: 200 }}
      >
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-4">
            {t('Select a language to add a new content.')}
          </p>

          <RecordSelect
            model="locale"
            displayField="name"
            pageSize={1000}
            searchFields={['name', 'iso_code']}
            label={t('Language')}
            placeholder={t('Select a Language')}
            required
            value={selectedLocaleId}
            onChange={setSelectedLocaleId}
            renderOption={(option) => (
              <span>
                {option.emoji_flag} {option.name}
              </span>
            )}
            filter={{
              id: {
                $nin: record.contents.map((t) => t.locale_id).filter(Boolean),
              },
            }}
          />

          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={closeAddContentModal} className="mr-2">
              {t('Cancel')}
            </Button>
            <Button
              onClick={handleAddContentSubmit}
              disabled={!selectedLocaleId || addingLanguage}
              loading={addingLanguage}
            >
              {t('Add Language')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Settings Drawer */}
      <Drawer
        opened={settingsDrawerOpened}
        onClose={handleCloseSettingsDrawer}
        size="md"
        position="right"
        transitionProps={{ transition: 'slide-left', duration: 200 }}
      >
        <Accordion
          defaultValue="post-settings"
          variant="unstyled"
          radius="md"
          classNames={{ control: 'px-0', content: 'px-0' }}
        >
          <Accordion.Item value="post-settings">
            <Accordion.Control>
              <H2>{t('Post settings')}</H2>
            </Accordion.Control>
            <Accordion.Panel>
              <div className="space-y-4">
                <AuthorSelector
                  value={record.author_id}
                  onChange={(value) => setRecord((prev) => ({ ...prev, author_id: value }))}
                />

                <DateTimePickerInput
                  label={t('Publication Date')}
                  placeholder={t('Select publication date')}
                  valueFormat="DD MMM YYYY hh:mm A"
                  value={record.publish_date ? new Date(record.publish_date) : new Date()}
                  onChange={(date) => setRecord({ ...record, publish_date: date })}
                  clearable={false}
                  variant="filled"
                />

                <TextInput
                  className="w-full"
                  variant="filled"
                  label={t('Slug')}
                  placeholder={t('Enter URL slug (required)')}
                  required
                  value={record.slug || ''}
                  onChange={(e) => setRecord({ ...record, slug: e.target.value })}
                />

                <Switch
                  classNames={{
                    body: 'flex-col-reverse gap-2',
                    label: 'px-0',
                    description: 'px-0 mt-0',
                  }}
                  checked={record.require_login || false}
                  size="lg"
                  label={t('Require Login')}
                  description={t('When enabled, users must be logged in to view this blog post')}
                  onChange={(e) => setRecord({ ...record, require_login: e.currentTarget.checked })}
                />
              </div>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="seo-settings">
            <Accordion.Control>
              <H2>{t('SEO')}</H2>
            </Accordion.Control>
            <Accordion.Panel>
              <SeoMetadataForm
                pageContent={activeContent}
                updateContentField={updateContentField}
              />
            </Accordion.Panel>
          </Accordion.Item>

          {activeContentTab && activeContentTab !== 'add_new' && (
            <Accordion.Item value="custom-code">
              <Accordion.Control>
                <H2>{t('Custom code')}</H2>
              </Accordion.Control>
              <Accordion.Panel>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('Language-specific custom code')}
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      {t(
                        'This code will be injected only for this language version of the blog post, after the content.',
                      )}
                    </p>
                    <div className="border border-gray-300 rounded" style={{ height: '150px' }}>
                      <Editor
                        className="w-full h-full"
                        value={activeContent?.custom_code || ''}
                        onValueChange={(code) => {
                          if (activeContent?.id) {
                            updateContentField(activeContent.id, 'custom_code', code);
                          }
                        }}
                        highlight={(code) => highlight(code, languages.markup, 'html')}
                        padding={10}
                        style={{
                          fontSize: 12,
                          backgroundColor: '#f6f8fa',
                          minHeight: '150px',
                        }}
                        placeholder="<!-- Enter HTML, CSS, or JavaScript code here -->"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('Blog post custom code (all languages)')}
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      {t(
                        'This code will be injected in all language versions of this blog post, after the content.',
                      )}
                    </p>
                    <div className="border border-gray-300 rounded" style={{ height: '150px' }}>
                      <Editor
                        className="w-full h-full"
                        value={record?.blog_post_custom_code || ''}
                        onValueChange={(code) =>
                          setRecord({ ...record, blog_post_custom_code: code })
                        }
                        highlight={(code) => highlight(code, languages.markup, 'html')}
                        padding={10}
                        style={{
                          fontSize: 12,
                          backgroundColor: '#f6f8fa',
                          minHeight: '150px',
                        }}
                        placeholder="<!-- Enter HTML, CSS, or JavaScript code here -->"
                      />
                    </div>
                  </div>
                </div>
              </Accordion.Panel>
            </Accordion.Item>
          )}
        </Accordion>
      </Drawer>

      <ChooseAttachmentModal
        isOpen={featuredImageModalOpened}
        close={closeFeaturedImageModal}
        type="image"
        onChange={(file) => {
          if (activeContent?.id) {
            updateContentField(activeContent.id, 'featured_image', file);
            updateContentField(activeContent.id, 'featured_image_id', file?.id);
          }
          closeFeaturedImageModal();
        }}
      />

      <RevisionsModal
        opened={revisionsModalOpened}
        onClose={() => setRevisionsModalOpened(false)}
        contentType="blog"
        contentId={activeContent?.id}
        hasWritePermission={true}
        onContentRestored={async () => {
          // Disable autosave before refetch so restored content isn't treated as a
          // user edit — re-enabling resets the baseline via useDraftAutosave.
          // Apply overlay manually: the overlay useEffect is keyed on record.id so it
          // won't re-run for a same-id refetch; and draftOverlayAppliedForIdRef must
          // be reset so the next overlay pass sees the restored draft_* fields.
          setOverlayReady(false);
          const fresh = await getOne(id);
          if (fresh?.contents) {
            draftOverlayAppliedForIdRef.current = null;
            const overlaid = applyDraftOverlayToContents(fresh.contents);
            setRecord({ ...fresh, contents: overlaid });
            setEditorKey((k) => k + 1);
            draftOverlayAppliedForIdRef.current = fresh.id;
            setOverlayReady(true);
          }
        }}
      />
    </>
  ) : (
    <FormViewSkeleton />
  );
}
