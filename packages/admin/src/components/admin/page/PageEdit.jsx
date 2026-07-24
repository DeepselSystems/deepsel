import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { LoadingOverlay, Modal, Tabs, Tooltip, Menu } from '@mantine/core';
import { getFlagUrl } from '@deepsel/cms-utils/flags';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import useModel from '../../../common/api/useModel.jsx';
import useMultiLangContent from '../../../common/hooks/useMultiLangContent.js';
import useResizablePanel from '../../../common/hooks/useResizablePanel.js';
import useSidebar from '../../../common/hooks/useSidebar.js';
import NotificationState from '../../../common/stores/NotificationState.js';
import SitePublicSettingsState from '../../../common/stores/SitePublicSettingsState.js';
import ShowHeaderBackButtonState from '../../../common/stores/ShowHeaderBackButtonState.js';
import HideHeaderItemsState from '../../../common/stores/HideHeaderItemsState.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import FormViewSkeleton from '../../../common/ui/FormViewSkeleton.jsx';
import RecordSelect from '../../../common/ui/RecordSelect.jsx';
import Switch from '../../../common/ui/Switch.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';
import RichTextInput from '../../../common/ui/RichTextInput.jsx';
import Button from '../../../common/ui/Button.jsx';
import { HOMEPAGE_DEFAULT_SLUG } from '../../../constants/slug.js';
import PageContentSettingDrawer from './components/PageContentSettingDrawer.jsx';
import AIWriterSidebar from '../../../common/ui/AIWriterSidebar.jsx';
import RevisionsModal from '../../../common/ui/RevisionsModal/index.jsx';
import ActiveEditorsAvatars from '../../../common/ui/ActiveEditorsAvatars.jsx';
import PublishStatusMenu from '../../../common/ui/PublishStatusMenu.jsx';

import useEditSession from '../../../common/hooks/useEditSession.js';
import useDraftAutosave from '../../../common/hooks/useDraftAutosave.js';
import useFetch from '../../../common/api/useFetch.js';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import { useAIProviderConfig } from '../../../common/AIProviderConfigContext.js';
import ConnectOpenRouterModal from '../../../common/ui/ConnectOpenRouterModal.jsx';
import {
  IconAi,
  IconCloudCheck,
  IconCloudUpload,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconPlus,
  IconSettings,
  IconSparkles2,
  IconSubtitlesAi,
  IconTrash,
} from '@tabler/icons-react';
import clsx from 'clsx';

const PAGE_DRAFT_FIELDS = [
  'title',
  'content',
  'seo_metadata_title',
  'seo_metadata_description',
  'seo_metadata_featured_image_id',
  'seo_metadata_allow_indexing',
  'custom_code',
];

function applyDraftOverlayToContents(contents) {
  if (!contents?.length) return contents;
  return contents.map((c) => {
    if (!c.has_draft) return c;
    const merged = { ...c };
    for (const field of PAGE_DRAFT_FIELDS) {
      const draftVal = c[`draft_${field}`];
      if (draftVal !== null && draftVal !== undefined) merged[field] = draftVal;
    }
    if (c.draft_seo_metadata_featured_image)
      merged.seo_metadata_featured_image = c.draft_seo_metadata_featured_image;
    return merged;
  });
}

export default function PageEdit({ onSuccess }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { notify } = NotificationState();
  const { settings: siteSettings } = SitePublicSettingsState();
  const { organizationId } = OrganizationIdState();
  const { setShowBackButton } = ShowHeaderBackButtonState();
  const { setHideNotifications, setHideSiteSelector, setHideGoToSite } = HideHeaderItemsState();
  const { isCollapsed, temporaryCollapse, clearTemporaryOverride } = useSidebar();

  // Determine if this is create mode (no id) or edit mode (has id)
  const isCreateMode = !id;

  // Initialize record for create mode, if there is no id
  const [createRecord, setCreateRecord] = useState({
    title: '',
    content: '',
    published: false,
    slug: '',
    contents: [],
    seo_metadata_allow_indexing: true,
  });

  // Single useModel query for both modes
  const query = useModel('page', { id, autoFetch: !!id });

  // Use create record for create mode, query record for edit mode
  const record = isCreateMode ? createRecord : query.record;
  const setRecord = isCreateMode ? setCreateRecord : query.setRecord;
  const { update, create } = query;

  const { data: locales } = useModel('locale', {
    autoFetch: true,
    pageSize: null,
  });

  // Used to persist newly added language contents in edit mode (see effect below).
  const pageContentModel = useModel('page_content', { autoFetch: false });

  // Use the multi-language content hook
  const {
    // State
    activeContentTab,
    setActiveContentTab,
    selectedLocaleId,
    setSelectedLocaleId,
    addingLanguage,

    // Modal state and controls
    addContentModalOpened,
    closeAddContentModal,
    settingsDrawerOpened,
    openSettingsDrawer,
    closeSettingsDrawer,

    // Content manipulation functions
    updateContentField,
    handleAddContent,
    handleDeleteContent,
    handleAddContentSubmit,

    // Submission helpers
    processContentsForSubmit,
    validateContents,
  } = useMultiLangContent({
    initialRecord: record,
    setRecord,
    locales,
    siteSettings,
    autoTranslate: true,
    contentType: 'page',
    onBeforeDelete: async (content) => {
      // Skip DB delete for frontend-only rows (not yet persisted). Otherwise
      // delete the real PageContent row so it doesn't linger server-side.
      // force=true because a previously published language accumulates
      // page_content_revision rows (NOT NULL FK to page_content), which the
      // backend's cascade-dependency guard would otherwise block on.
      if (isCreateMode || !content?.id || content._addNew) return;
      await pageContentModel.del(content.id, true);
    },
    // Create with empty live fields — anything the user typed (or the
    // auto-translation) flows into draft_* via the autosave once the real id
    // replaces the local placeholder.
    persistNewContent: async (newContent) => {
      return pageContentModel.create({
        page_id: record.id,
        locale_id: newContent.locale_id,
        title: '',
        slug: newContent.slug || '',
        organization_id: organizationId,
      });
    },
  });

  /**
   * Active content, that based on active tab
   * @type {PageContent}
   */
  const activeContent = useMemo(
    () => record?.contents?.find((c) => String(c.id) === activeContentTab),
    [activeContentTab, record?.contents],
  );

  const { width, handleMouseDown, isResizing } = useResizablePanel({
    initialWidth: 400,
    minWidth: 300,
    maxWidth: window.innerWidth - 200,
  });

  /** True while saving. */
  const [isSaving, setIsSaving] = useState(false);
  /** True until the first record load completes — gates initial skeleton vs. editor render. */
  const [isInitialLoading, setIsInitialLoading] = useState(!!id);
  /** True only while refetchAfterChange is in flight (publish / revert / restore). */
  const [isRefetching, setIsRefetching] = useState(false);

  const iframeRef = useRef(null);
  const [previewDevice, setPreviewDevice] = useState('desktop');
  const previewVisible = previewDevice !== null;
  const initialSidebarStateRef = useRef(null);
  const sidebarInitializedRef = useRef(false);
  const originalRecordRef = useRef(null);
  const [isIframeReady, setIsIframeReady] = useState(false);
  const queuedPreviewDataRef = useRef(null);
  const [aiAutocompleteEnabled, setAiAutocompleteEnabled] = useState(true);
  const aiAutoCompleteAvailable =
    !!siteSettings?.has_openrouter_api_key && !!siteSettings?.ai_autocomplete_model_id;
  const aiWritingAvailable =
    !!siteSettings?.has_openrouter_api_key && !!siteSettings?.ai_default_writing_model_id;
  const aiProviderConfig = useAIProviderConfig();
  const [connectModalOpened, setConnectModalOpened] = useState(false);
  const isOAuthMode = aiProviderConfig.mode === 'oauth';
  const needsConnect = isOAuthMode && !siteSettings?.has_openrouter_api_key;

  // AI Writer state
  const [aiWriterSidebarOpened, setAiWriterSidebarOpened] = useState(false);

  // Revisions sidebar state
  const [revisionsSidebarOpened, setRevisionsSidebarOpened] = useState(false);

  const [editorKey, setEditorKey] = useState(0);

  // True once the draft overlay effect has run — prevents autosave from firing
  // before overlaid draft values are captured as the baseline.
  const [overlayReady, setOverlayReady] = useState(isCreateMode);

  // Presence + live draft sync
  const { activeEditors, onDraftSaved, onPublished } = useEditSession('page', id, null);

  const draftOverlayAppliedForIdRef = useRef(null);

  // State to trigger preview updates when content changes
  const [previewTrigger, setPreviewTrigger] = useState(0);

  // State for rendered content
  const [renderedContent, setRenderedContent] = useState(null);

  // Render content API
  const { post: renderContentAPI } = useFetch('template_content/render', {
    autoFetch: false,
  });

  // Function to render wysiwyg content with Jinja2
  const renderWysiwygContent = async (contentStr, lang = null) => {
    if (!contentStr || typeof contentStr !== 'string') {
      return contentStr;
    }
    if (!contentStr.includes('{{') && !contentStr.includes('{%')) {
      return contentStr;
    }
    try {
      const renderResponse = await renderContentAPI({
        content: contentStr,
        name: `preview_${Date.now()}_${Math.random()}`,
        organization_id: organizationId,
        lang: lang,
      });
      return renderResponse.rendered_content;
    } catch (error) {
      console.error('Error rendering content:', error);
      return contentStr;
    }
  };

  // Redirect to theme editor if page slug conflicts with a theme-defined page
  const { backendHost } = BackendHostURLState();
  useEffect(() => {
    if (isCreateMode || !record?.contents?.length || !siteSettings?.selected_theme) return;

    const checkThemeConflict = async () => {
      try {
        const tokenResult = await (
          await import('@capacitor/preferences')
        ).Preferences.get({
          key: 'token',
        });
        const headers = {};
        if (tokenResult?.value) {
          headers.Authorization = `Bearer ${tokenResult.value}`;
        }
        if (organizationId) {
          headers['X-Organization-Id'] = String(organizationId);
        }

        const response = await fetch(
          `${backendHost}/theme/page-slugs/${siteSettings.selected_theme}`,
          { headers },
        );
        if (!response.ok) return;

        const { slugs } = await response.json();
        const conflictingContent = record.contents.find((c) => slugs.includes(c.slug));
        if (conflictingContent) {
          const filename =
            conflictingContent.slug === '/'
              ? 'Index.astro'
              : `${conflictingContent.slug.replace(/^\//, '')}.astro`;
          notify({
            message: t(
              'This page\'s slug conflicts with the theme file "{{file}}". Redirecting to theme editor.',
              { file: filename },
            ),
            type: 'info',
          });
          navigate(
            `/themes/edit/${siteSettings.selected_theme}?file=${encodeURIComponent(filename)}`,
            { replace: true },
          );
        }
      } catch (e) {
        console.error('Error checking theme conflict:', e);
      }
    };
    checkThemeConflict();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, siteSettings?.selected_theme]);

  // Capture initial sidebar state and auto-collapse on mount
  useEffect(() => {
    if (!sidebarInitializedRef.current) {
      // Capture initial state only once
      initialSidebarStateRef.current = isCollapsed;
      sidebarInitializedRef.current = true;

      // Temporarily collapse sidebar if it's currently open
      if (!isCollapsed) {
        temporaryCollapse();
      }
    }
  }, [isCollapsed, temporaryCollapse]);

  // Restore sidebar state on unmount
  useEffect(() => {
    return () => {
      // Clear temporary override to restore original user preference
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

  const currentContent = useMemo(() => {
    return record?.contents?.find((c) => String(c.id) === activeContentTab);
  }, [record, activeContentTab]);

  // Effect to render content when it changes
  useEffect(() => {
    if (currentContent?.content && organizationId) {
      // Get language code from current content's locale
      const lang = currentContent.locale?.iso_code || null;
      renderWysiwygContent(currentContent.content, lang)
        .then((rendered) => {
          setRenderedContent(rendered);
        })
        .catch((error) => {
          console.error('Error rendering content for preview:', error);
          setRenderedContent(currentContent.content); // Fallback to original
        });
    } else {
      setRenderedContent(currentContent?.content || null);
    }
  }, [currentContent?.content, currentContent?.locale?.iso_code, organizationId]);

  // Always route the iframe to /preview — the admin supplies all data via
  // postMessage, so the backend page fetch path is unnecessary (and would 404
  // for unpublished drafts in edit mode when the iframe lacks the session cookie).
  const previewUrl = useMemo(() => {
    const selectedLocaleCode = currentContent?.locale?.iso_code;
    if (!selectedLocaleCode) return null;

    const url = new URL(`/preview?lang=${selectedLocaleCode}`, window.location.origin);
    url.searchParams.set('preview', 'true');
    const previewOrgId = record?.organization_id || organizationId;
    if (previewOrgId) {
      url.searchParams.set('org_id', String(previewOrgId));
    }
    return url.toString();
  }, [currentContent?.locale?.iso_code, record?.organization_id, organizationId]);

  const previewData = useMemo(() => {
    if (!currentContent?.locale?.iso_code) return null;

    return {
      id: record?.id || currentContent.id || 'new',
      title: currentContent.title || 'Untitled',
      content: renderedContent || currentContent.content,
      lang: currentContent.locale?.iso_code || siteSettings?.default_language?.iso_code,
      published: record?.published || false,
      seo_metadata: {
        title: currentContent.seo_metadata_title,
        description: currentContent.seo_metadata_description,
        featured_image_id: currentContent.seo_metadata_featured_image_id,
        allow_indexing: currentContent.seo_metadata_allow_indexing !== false,
      },
      public_settings: siteSettings,
      is_preview: true,
      string_id: record?.string_id,
      notFound: false,
    };
  }, [currentContent, record, siteSettings, previewTrigger, renderedContent]);

  // Watch for record changes and trigger preview update
  useEffect(() => {
    if (record && record.contents) {
      setPreviewTrigger((prev) => prev + 1);
    }
    if (record) setIsInitialLoading(false);
  }, [record]);

  // Listen for iframe ready signal
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'IFRAME_READY') {
        setIsIframeReady(true);

        // Send queued data if available
        if (queuedPreviewDataRef.current && iframeRef.current) {
          try {
            iframeRef.current.contentWindow.postMessage(
              {
                type: 'PREVIEW_DATA',
                data: queuedPreviewDataRef.current,
              },
              window.location.origin,
            );
            queuedPreviewDataRef.current = null;
          } catch (error) {
            console.error('Error sending queued postMessage to iframe:', error);
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Update iframe URL
  useEffect(() => {
    if (previewUrl && iframeRef.current && previewVisible) {
      // Reset iframe ready state when URL changes
      setIsIframeReady(false);

      try {
        const iframe = iframeRef.current;
        if (iframe.contentWindow && iframe.contentWindow.location) {
          iframe.contentWindow.location.replace(previewUrl);
        } else {
          // Fallback for initial load or cross-origin restrictions
          iframe.src = previewUrl;
        }
      } catch (error) {
        // Cross-origin restrictions, fallback to src
        iframeRef.current.src = previewUrl;
      }
    }
  }, [previewUrl, previewVisible]);

  // Debounced postMessage sending to avoid too many updates
  useEffect(() => {
    if (previewData && iframeRef.current && previewUrl) {
      const sendMessage = () => {
        try {
          iframeRef.current.contentWindow.postMessage(
            {
              type: 'PREVIEW_DATA',
              data: previewData,
            },
            '*',
          );
        } catch (error) {
          console.error('Error sending postMessage to iframe:', error);
        }
      };

      // Debounce the message sending to avoid excessive updates
      const debounceTimer = setTimeout(() => {
        if (isIframeReady) {
          // Iframe is ready, send immediately
          sendMessage();
        } else {
          // Iframe not ready yet, queue the data AND try sending with delay
          queuedPreviewDataRef.current = previewData;

          // Fallback: try sending after short delay
          setTimeout(() => {
            if (iframeRef.current && queuedPreviewDataRef.current) {
              sendMessage();
              queuedPreviewDataRef.current = null;
            }
          }, 500);
        }
      }, 300); // 300ms debounce

      return () => clearTimeout(debounceTimer);
    }
  }, [previewData, previewUrl, isIframeReady]);

  // Reset overlayReady when navigating to a different page record.
  useEffect(() => {
    if (!isCreateMode) setOverlayReady(false);
  }, [id, isCreateMode]);

  // Overlay draft_* onto live fields once per loaded record. Bump editorKey
  // so RichTextInput (TipTap) remounts with the draft content.
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
        content: c.content,
        seo_metadata_title: c.seo_metadata_title,
        seo_metadata_description: c.seo_metadata_description,
        seo_metadata_featured_image_id: c.seo_metadata_featured_image_id,
        seo_metadata_allow_indexing: c.seo_metadata_allow_indexing,
        custom_code: c.custom_code,
      }));
  }, [record?.contents]);

  const autosave = useDraftAutosave({
    recordType: 'page',
    recordId: isCreateMode ? null : id,
    enabled: !isCreateMode && !!record?.id && !settingsDrawerOpened && overlayReady,
    buildContentsPayload,
  });

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
            for (const field of PAGE_DRAFT_FIELDS) {
              const v = incoming[`draft_${field}`];
              if (v !== null && v !== undefined) merged[field] = v;
            }
            return merged;
          }),
        };
      });
      setEditorKey((k) => k + 1);
    });
    onPublished(async () => {
      if (!isCreateMode) {
        draftOverlayAppliedForIdRef.current = null;
        await query.getOne(id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track changes to detect unsaved modifications
  useEffect(() => {
    if (record && Object.keys(record).length > 0) {
      if (!originalRecordRef.current) {
        // Store original record on first load
        originalRecordRef.current = JSON.parse(JSON.stringify(record));
      }
    }
  }, [record]);

  // Reset unsaved changes flag after successful save
  const resetUnsavedChanges = useCallback(() => {
    if (record) {
      originalRecordRef.current = JSON.parse(JSON.stringify(record));
    }
  }, [record]);

  const handleContentInserted = () => {
    setPreviewTrigger((prev) => prev + 1);
    setEditorKey((k) => k + 1);
  };

  // Create mode still uses the regular CRUD POST; draft autosave only runs in edit mode.
  const handleCreateSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setIsSaving(true);
      try {
        let processedContents = processContentsForSubmit(record.contents);
        if (record.is_homepage) {
          processedContents = processedContents.map((content) => ({
            ...content,
            slug: HOMEPAGE_DEFAULT_SLUG,
          }));
        }

        const updatedRecord = {
          ...record,
          published: false,
          contents: processedContents.map((content) => ({
            ...content,
            seo_metadata_title: content.seo_metadata_title || content.title,
          })),
        };
        updatedRecord.slug = updatedRecord.slug || '/';

        validateContents(processedContents);

        const created = await create({ ...updatedRecord, organization_id: organizationId });
        resetUnsavedChanges();
        notify({ message: t('Draft saved!'), type: 'success' });
        if (onSuccess) onSuccess(created);
        if (created?.id) {
          navigate(`/pages/${created.id}/edit`, { replace: true });
          window.location.reload();
        }
      } catch (error) {
        console.error(error);
        notify({ message: error.message, type: 'error' });
      } finally {
        setIsSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      record,
      processContentsForSubmit,
      validateContents,
      create,
      organizationId,
      onSuccess,
      navigate,
    ],
  );

  const flushDraftBeforePublish = async () => {
    const contents = buildContentsPayload();
    if (contents.length) await autosave.flushNow?.(contents);
  };

  const refetchAfterChange = async () => {
    setIsRefetching(true);
    try {
      // Disable autosave before refetching so the incoming content does not look like
      // a user edit. The disabled→enabled transition resets the autosave baseline via
      // useDraftAutosave's enabled-off effect, ensuring the fresh data is captured as
      // the new baseline without scheduling a save.
      setOverlayReady(false);
      // The overlay useEffect is keyed on record.id and won't re-run for a refetch
      // of the same record, so we apply it manually here to keep any still-pending
      // per-language drafts visible (e.g. after reverting only the active language).
      const fresh = await query.getOne(id);
      if (fresh?.contents) {
        const overlaid = applyDraftOverlayToContents(fresh.contents);
        setRecord({ ...fresh, contents: overlaid });
        setEditorKey((k) => k + 1);
        draftOverlayAppliedForIdRef.current = fresh.id;
        setOverlayReady(true);
      }
    } finally {
      setIsRefetching(false);
    }
  };

  // Snapshot parent-level settings when the drawer opens so we can detect on close
  // Parent fields (no draft column) are snapshot-compared on drawer open/close and
  // persisted via update() if dirty. Slug is a content field with no draft column
  // either, so it's also saved on close. Homepage switch additionally sets all
  // content slugs to '/' (backend resolves the old homepage's slug automatically).
  const settingsSnapshotRef = useRef(null);
  const slugSnapshotRef = useRef(null);
  const snapshotSettings = () =>
    JSON.stringify({
      is_homepage: record?.is_homepage ?? false,
      require_login: record?.require_login ?? false,
      page_custom_code: record?.page_custom_code ?? '',
    });

  const handleOpenSettingsDrawer = () => {
    settingsSnapshotRef.current = snapshotSettings();
    slugSnapshotRef.current = { id: activeContent?.id, slug: activeContent?.slug ?? '' };
    openSettingsDrawer();
  };

  const handleCloseSettingsDrawer = async () => {
    closeSettingsDrawer();
    if (isCreateMode || !record?.id) return;

    const pendingContents = buildContentsPayload();
    if (pendingContents.length) await autosave.flushNow?.(pendingContents);

    const settingsSnapshot = JSON.parse(settingsSnapshotRef.current || '{}');
    const wasHomepage = settingsSnapshot.is_homepage ?? false;
    const settingsChanged = snapshotSettings() !== settingsSnapshotRef.current;
    const homepageChanged = record.is_homepage !== wasHomepage;
    let homepageApiOk = true;

    // Tracks what's actually persisted for is_homepage this run. Starts optimistic
    // and is rolled back to the snapshot if the settings save below fails, so the
    // slug-sync step further down never acts on a value the server never got.
    let effectiveIsHomepage = record.is_homepage;

    if (settingsChanged) {
      // useModel's update() overwrites the whole local record with its PUT
      // response (see useModel.ts), which reflects only *live* per-content
      // fields — any content edits still sitting in draft_* (per-language
      // custom code, title, etc. from the autosave just flushed above) get
      // silently wiped from local state even though they're safely persisted
      // server-side, because this endpoint only accepts page-level fields and
      // never echoes drafts back. Preserve the local contents across the call.
      const contentsBeforeUpdate = record.contents;
      try {
        await update({
          id: record.id,
          is_homepage: record.is_homepage,
          require_login: record.require_login,
          page_custom_code: record.page_custom_code,
        });
        setRecord((prev) => ({ ...prev, contents: contentsBeforeUpdate }));
      } catch (error) {
        console.error(error);
        notify({ message: error.message, type: 'error' });
        if (homepageChanged) homepageApiOk = false;
        effectiveIsHomepage = wasHomepage;
        // Roll the whole settings group back to what's actually persisted —
        // otherwise the drawer keeps showing values that failed to save, and
        // reopening it looks like the change went through when it didn't.
        setRecord((prev) => ({
          ...prev,
          is_homepage: settingsSnapshot.is_homepage ?? false,
          require_login: settingsSnapshot.require_login ?? false,
          page_custom_code: settingsSnapshot.page_custom_code ?? '',
        }));
      }
    }

    // is_homepage just toggled ON (and actually persisted): set all content slugs to '/'
    if (effectiveIsHomepage && !wasHomepage) {
      try {
        await Promise.all(
          (record.contents || [])
            .filter((c) => c.id && !c._addNew)
            .map((c) => pageContentModel.update({ id: c.id, slug: HOMEPAGE_DEFAULT_SLUG })),
        );
        setRecord((prev) => ({
          ...prev,
          contents: (prev.contents || []).map((c) => ({ ...c, slug: HOMEPAGE_DEFAULT_SLUG })),
        }));
      } catch (error) {
        console.error(error);
        notify({ message: error.message, type: 'error' });
        homepageApiOk = false;
      }
    } else {
      // Save slug for active content if changed (not applicable when is_homepage is on)
      const snap = slugSnapshotRef.current;
      if (!effectiveIsHomepage && snap?.id) {
        const currentSlug = record.contents?.find((c) => c.id === snap.id)?.slug ?? '';
        if (currentSlug !== snap.slug) {
          try {
            await pageContentModel.update({ id: snap.id, slug: currentSlug });
          } catch (error) {
            console.error(error);
            notify({ message: error.message, type: 'error' });
            // Roll the slug back to what's actually persisted, same reasoning
            // as the settings rollback above.
            setRecord((prev) => ({
              ...prev,
              contents: (prev.contents || []).map((c) =>
                c.id === snap.id ? { ...c, slug: snap.slug } : c,
              ),
            }));
          }
        }
      }
    }

    if (homepageChanged && homepageApiOk) {
      window.location.reload();
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

  return (!isInitialLoading && record) || isCreateMode ? (
    <>
      <form
        onSubmit={isCreateMode ? handleCreateSubmit : (e) => e.preventDefault()}
        className={clsx(
          'w-full flex flex-col',
          'min-h-[calc(100vh-(var(--app-shell-header-offset,0rem)+var(--app-shell-padding))-var(--app-shell-padding))]',
        )}
      >
        {/* Top Toolbar */}
        <div className="flex-shrink-0 px-4 py-2 flex items-center justify-end gap-2">
          <Menu shadow="md" width={180} position="bottom-end" withArrow radius="md">
            <Menu.Target>
              <Tooltip label={t('Preview')}>
                <Button variant={previewVisible ? 'filled' : 'subtle'} size="md" className="px-2">
                  <IconDeviceDesktop size={20} />
                </Button>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconDeviceDesktop size={16} />}
                onClick={() => setPreviewDevice('desktop')}
                color={previewDevice === 'desktop' ? 'blue' : undefined}
              >
                {t('Desktop')}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconDeviceTablet size={16} />}
                onClick={() => setPreviewDevice('tablet')}
                color={previewDevice === 'tablet' ? 'blue' : undefined}
              >
                {t('Tablet')}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconDeviceMobile size={16} />}
                onClick={() => setPreviewDevice('mobile')}
                color={previewDevice === 'mobile' ? 'blue' : undefined}
              >
                {t('Mobile')}
              </Menu.Item>
              {previewVisible && (
                <>
                  <Menu.Divider />
                  <Menu.Item color="red" onClick={() => setPreviewDevice(null)}>
                    {t('Hide preview')}
                  </Menu.Item>
                </>
              )}
            </Menu.Dropdown>
          </Menu>
          <Menu shadow="md" width={250} position="bottom-end" withArrow radius="md">
            <Menu.Target>
              <Button variant="subtle" size="md" className="px-2">
                <IconAi size={40} />
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item closeMenuOnClick={false}>
                <Tooltip
                  label={
                    needsConnect
                      ? t('Connect OpenRouter to use this feature')
                      : t(
                          'Please specify an API key and writing model in Site Settings to use this feature.',
                        )
                  }
                  disabled={aiWritingAvailable}
                >
                  <div
                    className="inline-flex items-center"
                    onClick={needsConnect ? () => setConnectModalOpened(true) : undefined}
                  >
                    <Switch
                      label={
                        <span className="inline-flex items-center gap-1">
                          <IconSparkles2 size={16} />
                          {t('AI Writer')}
                        </span>
                      }
                      checked={aiWriterSidebarOpened}
                      onChange={(e) =>
                        needsConnect
                          ? setConnectModalOpened(true)
                          : setAiWriterSidebarOpened(e.currentTarget.checked)
                      }
                      disabled={!aiWritingAvailable && !needsConnect}
                      size="md"
                    />
                  </div>
                </Tooltip>
              </Menu.Item>
              <Menu.Item closeMenuOnClick={false}>
                <Tooltip
                  label={
                    needsConnect
                      ? t('Connect OpenRouter to use this feature')
                      : t(
                          'Please specify an API key and autocomplete model in Site Settings to use this feature.',
                        )
                  }
                  disabled={aiAutoCompleteAvailable}
                >
                  <div
                    className="inline-flex items-center"
                    onClick={needsConnect ? () => setConnectModalOpened(true) : undefined}
                  >
                    <Switch
                      label={
                        <span className="inline-flex items-center gap-1">
                          <IconSubtitlesAi size={16} />
                          {t('AI Autocomplete')}
                        </span>
                      }
                      checked={aiAutocompleteEnabled && aiAutoCompleteAvailable}
                      onChange={(e) =>
                        needsConnect
                          ? setConnectModalOpened(true)
                          : setAiAutocompleteEnabled(e.currentTarget.checked)
                      }
                      disabled={!aiAutoCompleteAvailable && !needsConnect}
                      size="md"
                    />
                  </div>
                </Tooltip>
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
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
            recordType="page"
            record={record}
            isCreateMode={isCreateMode}
            activeContent={currentContent}
            siteSettings={siteSettings}
            typeLabel={t('Page')}
            parentFields={{
              slug: record?.slug,
              is_homepage: record?.is_homepage,
              require_login: record?.require_login,
            }}
            flushDraft={flushDraftBeforePublish}
            onAfterPublish={async () => {
              await refetchAfterChange();
              resetUnsavedChanges();
              sessionStorage.setItem(
                'pageUpdated',
                JSON.stringify({ pageId: id, timestamp: Date.now() }),
              );
            }}
            onAfterUnpublish={refetchAfterChange}
            onAfterRevert={async () => {
              await refetchAfterChange();
              resetUnsavedChanges();
            }}
            onOpenRevisions={() => setRevisionsSidebarOpened(true)}
          />
          {isCreateMode && (
            <Button
              className="text-[14px] font-[600]"
              disabled={isInitialLoading || isSaving}
              loading={isInitialLoading || isSaving}
              variant="filled"
              type="submit"
              color="green"
            >
              {t('Save draft')}
            </Button>
          )}
          <Tooltip label={t('Settings')}>
            <Button variant="subtle" size="md" onClick={handleOpenSettingsDrawer} className="px-2">
              <IconSettings size={20} />
            </Button>
          </Tooltip>
        </div>

        <div className="flex flex-1">
          {/* Form Section - Left Side */}
          <div
            className={
              previewVisible
                ? 'overflow-y-auto px-2 pb-2'
                : 'overflow-y-auto pb-2 flex-1 max-w-screen-xl m-auto px-[24px]'
            }
            style={previewVisible ? { width: `${width}px`, flexShrink: 0 } : undefined}
          >
            {/* Content Editing Section */}
            <div>
              <LoadingOverlay
                visible={isRefetching}
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
                <Tabs.List className="mb-2 flex-wrap">
                  {record?.contents?.map((content) => (
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
                            <img
                              src={getFlagUrl(content.locale?.iso_code ?? '')}
                              alt={content.locale?.name ?? ''}
                              className="h-4 w-auto rounded-sm inline-block mr-1"
                            />
                            {content.locale?.name}
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

                  <Tooltip label={t('Add Language')}>
                    <button
                      type="button"
                      onClick={handleAddContent}
                      className="border border-dashed px-2 rounded-xl border-gray-300 hover:bg-gray-200"
                    >
                      <IconPlus size={16} />
                    </button>
                  </Tooltip>
                </Tabs.List>

                {record?.contents?.length > 0 ? (
                  record.contents.map((content) => (
                    <Tabs.Panel key={content.id} value={String(content.id)}>
                      <div className="flex gap-4 my-2">
                        <div className="flex flex-col grow gap-2"></div>
                      </div>

                      {/* Title */}
                      <TextInput
                        className="w-full"
                        classNames={{ input: 'font-bold text-[42px]' }}
                        placeholder={t('Enter a title...')}
                        size="xl"
                        variant="unstyled"
                        required
                        value={content.title || ''}
                        onChange={(e) => {
                          updateContentField(content.id, 'title', e.target.value);
                        }}
                      />

                      {/* Content Editor */}
                      <div className="my-4 pl-1">
                        <RichTextInput
                          key={`editor-${content.id}-${editorKey}`}
                          variant="subtle"
                          content={content.content || ''}
                          locale={content.locale}
                          onChange={(value) => {
                            updateContentField(content.id, 'content', value);
                          }}
                          styles={{
                            root: { border: 'none' },
                          }}
                          autoComplete={aiAutocompleteEnabled && aiAutoCompleteAvailable}
                        />
                      </div>
                    </Tabs.Panel>
                  ))
                ) : (
                  <div className="p-8 text-center text-gray-500">{t('Nothing here yet.')}</div>
                )}
              </Tabs>
            </div>
          </div>

          {previewVisible && (
            <>
              {/* Resize Handle */}
              <div
                className="hover:bg-blue-200 cursor-col-resize transition-colors"
                onMouseDown={handleMouseDown}
                style={{ cursor: 'col-resize', flexShrink: 0, width: '4px' }}
                title="Drag to resize"
              />

              {/* Preview Panel - Right Side */}
              <div className="flex-1 relative flex flex-col" style={{ minWidth: 0 }}>
                {/* Preview Content */}
                <div className="flex-1 relative">
                  {/* Conditional overlay during resize to prevent iframe from capturing mouse events */}
                  {isResizing && (
                    <div className="absolute inset-0 z-10 bg-transparent cursor-col-resize" />
                  )}
                  <div className="h-full flex items-center justify-center bg-gray-100 rounded-lg">
                    <div
                      className="bg-white shadow-lg transition-all duration-300"
                      style={{
                        width:
                          previewDevice === 'desktop'
                            ? '100%'
                            : previewDevice === 'tablet'
                              ? '1024px'
                              : '393px',
                        height:
                          previewDevice === 'desktop'
                            ? 'calc(100% - 0px)'
                            : previewDevice === 'tablet'
                              ? '852px'
                              : '852px',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        borderRadius: '8px',
                      }}
                    >
                      {previewUrl ? (
                        <iframe
                          ref={iframeRef}
                          className="w-full h-full border border-gray-300 !shadow"
                          style={{ borderRadius: '8px' }}
                          title={`Preview`}
                          sandbox="allow-same-origin allow-scripts allow-forms allow-link allow-presentation"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">
                          <div className="text-center">
                            <p>{t('No content selected')}</p>
                            <p className="text-sm mt-1">{t('Select a language tab to preview')}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          <AIWriterSidebar
            opened={aiWriterSidebarOpened}
            onClose={() => setAiWriterSidebarOpened(false)}
            activeContent={activeContent}
            updateContentField={updateContentField}
            onContentInserted={handleContentInserted}
          />
        </div>
      </form>

      <RevisionsModal
        opened={revisionsSidebarOpened}
        onClose={() => setRevisionsSidebarOpened(false)}
        contentType="page"
        contentId={currentContent?.id}
        hasWritePermission={true}
        onContentRestored={refetchAfterChange}
      />

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
                <img
                  src={getFlagUrl(option.iso_code)}
                  alt={option.name}
                  className="h-4 w-auto rounded-sm inline-block"
                />{' '}
                {option.name}
              </span>
            )}
            filter={{
              id: {
                $nin: record.contents.map((t) => t.locale_id).filter(Boolean),
              },
            }}
            filters={
              record?.contents?.map((content) => ({
                field: 'id',
                operator: '!=',
                value: content.locale_id,
              })) || []
            }
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
      {!!activeContent && (
        <PageContentSettingDrawer
          opened={settingsDrawerOpened}
          onClose={handleCloseSettingsDrawer}
          pageContent={activeContent}
          updateContentField={updateContentField}
          page={record}
          setPage={setRecord}
          updatePageField={(field, value) => setRecord({ ...record, [field]: value })}
          themeName={siteSettings?.selected_theme}
        />
      )}
      <ConnectOpenRouterModal
        opened={connectModalOpened}
        onClose={() => setConnectModalOpened(false)}
      />
    </>
  ) : (
    <FormViewSkeleton />
  );
}
