import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { getFlagUrl } from '@deepsel/cms-utils/flags';
import NotificationState from '../stores/NotificationState.js';
import SitePublicSettingsState from '../stores/SitePublicSettingsState.js';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';

/**
 * Hook for managing multilingual content in the CMS
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.initialRecord - Initial record data
 * @param {Function} options.setRecord - Function to update the record state
 * @param {Array} options.locales - Available locales
 * @param {Boolean} options.autoTranslate - Whether to auto-translate content
 * @param {String} options.contentType - Type of content ('page' or 'blog_post')
 * @returns {Object} - Functions and state for managing multilingual content
 */
export default function useMultiLangContent({
  initialRecord,
  setRecord,
  locales,
  autoTranslate = false,
  contentType = 'page',
  onBeforeDelete,
}) {
  const { t } = useTranslation();
  const { notify } = NotificationState();
  const { backendHost } = BackendHostURLState();
  const { settings: siteSettings } = SitePublicSettingsState();
  const [searchParams] = useSearchParams();

  /** locale_id from ?locale_id=X — used once to pre-select the tab on load. */
  const urlLocaleId = searchParams.get('locale_id')
    ? parseInt(searchParams.get('locale_id'), 10)
    : null;

  const [activeContentTab, setActiveContentTab] = useState(null);
  const [selectedLocaleId, setSelectedLocaleId] = useState(null);
  const [addingLanguage, setAddingLanguage] = useState(false);

  // Modal controls
  const [addContentModalOpened, { open: openAddContentModal, close: closeAddContentModal }] =
    useDisclosure(false);

  const [settingsDrawerOpened, { open: openSettingsDrawer, close: closeSettingsDrawer }] =
    useDisclosure(false);

  // Initialize with default content using the site's default language
  useEffect(() => {
    if (initialRecord?.contents?.length === 0 && siteSettings) {
      const defaultLocale =
        siteSettings.default_language ||
        locales?.find((locale) => locale.iso_code.toLowerCase() === 'en');

      if (defaultLocale) {
        const newId = 1;

        const defaultContent = {
          _addNew: true,
          id: newId,
          title: '',
          content: '',
          locale_id: defaultLocale.id,
          locale: defaultLocale,
          slug: null,
          seo_metadata_allow_indexing: true,
        };

        setRecord((prev) => ({
          ...prev,
          contents: [defaultContent],
        }));

        setActiveContentTab(String(newId));
      }
    }
  }, [locales, siteSettings, initialRecord, setRecord]);

  // Set initial active tab if contents exist.
  // Priority: ?locale_id=X URL param → site default language → first content.
  useEffect(() => {
    if (initialRecord?.contents?.length > 0 && !activeContentTab) {
      let target = null;

      if (urlLocaleId) {
        target = initialRecord.contents.find((c) => c.locale_id === urlLocaleId) ?? null;
      }

      if (!target) {
        const defaultLangId = siteSettings?.default_language?.id;
        target = initialRecord.contents.find((c) => c.locale_id === defaultLangId) ?? null;
      }

      if (!target) {
        const sorted = [...initialRecord.contents].sort((a, b) => a.id - b.id);
        target = sorted[0];
      }

      if (target) setActiveContentTab(String(target.id));
    }
  }, [initialRecord?.contents, activeContentTab, siteSettings?.default_language?.id, urlLocaleId]);

  /**
   * Get the name of a language by its locale ID
   */
  const getLanguageName = (locale_id) => {
    const locale = locales?.find((locale) => locale.id === locale_id);
    return locale ? locale.name : '';
  };

  /**
   * Get the flag emoji of a language by its locale ID
   */
  const getLanguageFlag = (locale_id) => {
    const locale = locales?.find((locale) => locale.id === locale_id);
    return locale ? getFlagUrl(locale.iso_code) : null;
  };

  /**
   * Generate a slug from a title. Returns '' when the title yields no usable
   * characters — callers decide the fallback (e.g. inherit from another locale)
   * instead of silently defaulting to '/' and colliding with the homepage.
   */
  const generateSlug = (title) => {
    if (!title) return '';
    const slug = title
      .normalize('NFD') // Decompose accented characters (ợ → o + combining mark)
      .replace(/[\u0300-\u036f]/g, '') // Strip combining diacritical marks → pure ASCII for Latin scripts
      .toLowerCase()
      .replace(/\s+/g, '-') // Spaces to hyphens
      .replace(/[^a-z0-9-]/g, '') // Keep only alphanumeric and hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Trim leading/trailing hyphens

    if (!slug) return '';
    return slug.startsWith('/') ? slug : `/${slug}`;
  };

  /**
   * Pick a slug to inherit from sibling locale contents when adding a new
   * language. Prefers the default site language, then any existing content
   * with a slug. Returns '' when nothing usable is available.
   */
  const inheritSlugFromContents = (contents) => {
    if (!contents?.length) return '';
    const defaultLangId = siteSettings?.default_language_id || siteSettings?.default_language?.id;
    const defaultContent = defaultLangId
      ? contents.find((c) => c.locale_id === defaultLangId && c.slug)
      : null;
    const source = defaultContent || contents.find((c) => c.slug);
    return source?.slug || '';
  };

  /**
   * Update a specific field in a content item
   */
  const updateContentField = (contentId, field, value) => {
    setRecord((prevState) => {
      const contentIndex = prevState.contents.findIndex((content) => content.id === contentId);

      if (contentIndex === -1) {
        return prevState;
      }

      const updatedContents = [...prevState.contents];
      const oldValue = updatedContents[contentIndex][field];
      if (oldValue === value) return prevState;

      // Mark as having a pending draft so the status pill flips to
      // "Published · Draft pending" immediately instead of waiting for the
      // autosave round-trip.
      updatedContents[contentIndex] = {
        ...updatedContents[contentIndex],
        [field]: value,
        has_draft: true,
      };

      const newState = {
        ...prevState,
        contents: updatedContents,
      };

      return newState;
    });
  };

  /**
   * Update a content's slug when its title changes
   */
  const updateContentSlug = (contentId, title) => {
    setRecord((prev) => ({
      ...prev,
      contents: prev.contents.map((content) => {
        if (content.id === contentId) {
          return {
            ...content,
            slug: generateSlug(title),
          };
        }
        return content;
      }),
    }));
  };

  /**
   * Handle adding a new content language
   */
  const handleAddContent = () => {
    openAddContentModal();
  };

  /**
   * Handle deleting a content language
   */
  const handleDeleteContent = (contentId) => {
    modals.openConfirmModal({
      title: t('Delete content'),
      centered: true,
      children: t('Are you sure you want to delete this content?'),
      labels: { confirm: t('Delete'), cancel: t('Cancel') },
      onConfirm: () => confirmDeleteContent(contentId),
      onCancel: () => {},
    });
  };

  /**
   * Confirm deletion of a content language
   */
  const confirmDeleteContent = async (contentId) => {
    const contentToDelete = initialRecord?.contents?.find((c) => c.id === contentId);
    if (onBeforeDelete) {
      try {
        await onBeforeDelete(contentToDelete);
      } catch (err) {
        notify({
          message: t('Error deleting content: ') + (err?.message || err),
          type: 'error',
        });
        return;
      }
    }

    setRecord((prevState) => ({
      ...prevState,
      contents: prevState.contents.filter((content) => content.id !== contentId),
    }));

    // If the active tab is being deleted, set active tab to another content or null
    if (activeContentTab === String(contentId)) {
      const remainingContents = initialRecord.contents.filter(
        (content) => content.id !== contentId,
      );

      if (remainingContents.length > 0) {
        setActiveContentTab(String(remainingContents[0].id));
      } else {
        setActiveContentTab(null);
      }
    }
  };

  /**
   * Handle submitting a new content language
   */
  const handleAddContentSubmit = async () => {
    if (!selectedLocaleId) {
      notify({
        message: t('Please select a language for the content.'),
        type: 'error',
      });
      return;
    }

    setAddingLanguage(true);

    try {
      // Check if content for this locale already exists
      if (initialRecord.contents.some((t) => t.locale_id === selectedLocaleId)) {
        notify({
          message: t('A content for this language already exists.'),
          type: 'error',
        });
        setAddingLanguage(false);
        return;
      }

      const newId =
        initialRecord.contents.length > 0
          ? Math.max(...initialRecord.contents.map((t) => t.id)) + 1
          : 1;

      // Default empty content. Slug is left unset here so the final value can
      // be inherited from sibling locales below (see newContent construction).
      let newContentData = {
        title: '',
        content: '',
      };

      // Check if auto-translate is enabled
      const shouldAutoTranslate =
        autoTranslate &&
        ((contentType === 'page' && siteSettings?.auto_translate_pages) ||
          (contentType === 'blog_post' && siteSettings?.auto_translate_posts));

      if (shouldAutoTranslate && initialRecord.contents.length > 0) {
        try {
          // Find a source content to translate from based on priority:
          // 1. Default site language
          // 2. First available content
          let sourceContent = null;
          let sourceLocale = null;

          // Get the default site language content
          const defaultLangId = siteSettings?.default_language_id;
          const defaultLangContent = initialRecord.contents.find(
            (content) => content.locale_id === defaultLangId,
          );

          if (defaultLangContent) {
            sourceContent = defaultLangContent;
            // Find the locale in either locales array or available_languages array
            const defaultLocale = locales.find((locale) => locale.id === defaultLangId);
            sourceLocale = defaultLocale?.iso_code;
          }

          // If no default language content, use the first available content
          if (!sourceContent && initialRecord.contents.length > 0) {
            sourceContent = initialRecord.contents[0];
            const sourceLocaleObj = locales.find((locale) => locale.id === sourceContent.locale_id);
            sourceLocale = sourceLocaleObj?.iso_code;
          }

          // If we found a source content and locale, translate it
          if (sourceContent && sourceLocale) {
            const targetLocaleObj = locales.find((locale) => locale.id === selectedLocaleId);
            const targetLocale = targetLocaleObj?.iso_code;

            if (targetLocale) {
              // Call the translation endpoint
              const url = `${backendHost}/${contentType}/translate`;

              try {
                const orgId = parseInt(localStorage.getItem('organizationId') || '', 10);
                const response = await fetch(url, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(Number.isFinite(orgId) ? { 'X-Organization-Id': String(orgId) } : {}),
                  },
                  body: JSON.stringify({
                    content: {
                      title: sourceContent.title || '',
                      content: sourceContent.content || '',
                    },
                    sourceLocale,
                    targetLocale,
                  }),
                });

                if (!response.ok) {
                  const errorText = await response.text();
                  throw new Error(`Translation failed: ${response.status} ${errorText}`);
                }

                const translatedContent = await response.json();
                newContentData = translatedContent;

                notify({
                  message: t('Content translated successfully'),
                  type: 'success',
                });
              } catch (error) {
                console.error('Error calling translation API:', error);
                notify({
                  message: t('Error translating content: ') + error.message,
                  type: 'error',
                });
              }
            }
          }
        } catch (error) {
          console.error('Error translating content:', error);
          notify({
            message: t('Error translating content: ') + error.message,
            type: 'error',
          });
        }
      }

      const locale = locales.find((locale) => locale.id === selectedLocaleId);
      // Slugs typically match across locales (only the lang URL prefix differs),
      // so inherit from an existing locale first. Fall back to generating from
      // the (possibly translated) title, and lastly to empty so the user can
      // set it manually — never default to '/'.
      const inheritedSlug = inheritSlugFromContents(initialRecord.contents);
      const newContent = {
        _addNew: true,
        id: newId,
        title: newContentData.title,
        content: newContentData.content,
        locale_id: selectedLocaleId,
        locale,
        slug: inheritedSlug || generateSlug(newContentData.title) || '',
        seo_metadata_allow_indexing: true,
      };

      setRecord((prev) => ({
        ...prev,
        contents: [...prev.contents, newContent],
      }));

      setActiveContentTab(String(newId));
      setSelectedLocaleId(null);
      closeAddContentModal();
      notify({
        message: t('New language content added successfully!'),
        type: 'success',
      });
    } catch (error) {
      console.error(error);
      notify({
        message: t('Error adding language content: ') + error.message,
        type: 'error',
      });
    } finally {
      setAddingLanguage(false);
    }
  };

  /**
   * Process contents before submission
   */
  const processContentsForSubmit = (contents) => {
    const inheritedSlug = inheritSlugFromContents(contents);
    const resolveSlug = (slug, title) => {
      if (slug) return slug.startsWith('/') ? slug : `/${slug}`;
      return generateSlug(title) || inheritedSlug || '';
    };

    return contents.map(({ _addNew, ...rest }) => {
      // Check if this is truly a new content item or has a temporary ID
      const isNewContent =
        _addNew ||
        !rest.id ||
        (rest.id && !rest.created_at) || // Has ID but no created_at means temporary frontend ID
        (typeof rest.id === 'number' && rest.id > 1000000); // High number suggests temporary ID

      if (isNewContent) {
        // For new content items, only send essential fields that the backend needs
        // Remove temporary fields like id, locale object, and database-specific fields
        const {
          id,
          locale,
          created_at,
          updated_at,
          string_id,
          system,
          active,
          is_technical,
          owner_id,
          organization_id,
          featured_image,
          seo_metadata_featured_image,
          updated_by,
          revisions,
          last_modified_at,
          updated_by_id,
          published,
          ...newContentData
        } = rest;

        newContentData.slug = resolveSlug(newContentData.slug, newContentData.title);
        return newContentData;
      }

      rest.slug = resolveSlug(rest.slug, rest.title);
      return rest;
    });
  };

  /**
   * Validate contents before submission
   */
  const validateContents = (contents) => {
    const localeIds = contents.map((t) => t.locale_id);
    if (localeIds.length !== new Set(localeIds).size) {
      throw new Error(
        t('Each content must have a unique language. Please remove duplicate languages.'),
      );
    }
    return true;
  };

  return {
    // State
    activeContentTab,
    setActiveContentTab,
    selectedLocaleId,
    setSelectedLocaleId,
    addingLanguage,

    // Modal state and controls
    addContentModalOpened,
    openAddContentModal,
    closeAddContentModal,
    settingsDrawerOpened,
    openSettingsDrawer,
    closeSettingsDrawer,

    // Utility functions
    getLanguageName,
    getLanguageFlag,
    generateSlug,

    // Content manipulation functions
    updateContentField,
    updateContentSlug,
    handleAddContent,
    handleDeleteContent,
    handleAddContentSubmit,

    // Submission helpers
    processContentsForSubmit,
    validateContents,
  };
}
