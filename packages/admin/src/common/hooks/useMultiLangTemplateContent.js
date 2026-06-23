import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import NotificationState from '../stores/NotificationState.js';
import SitePublicSettingsState from '../stores/SitePublicSettingsState.js';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';

/**
 * Hook for managing multilingual template content in the CMS
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.initialRecord - Initial template record data
 * @param {Function} options.setRecord - Function to update the record state
 * @param {Array} options.locales - Available locales
 * @returns {Object} - Functions and state for managing multilingual template content
 */
export default function useMultiLangTemplateContent({ initialRecord, setRecord, locales }) {
  const { t } = useTranslation();
  const { notify } = NotificationState();
  const { settings: siteSettings } = SitePublicSettingsState();

  const [activeContentTab, setActiveContentTab] = useState(null);
  const [selectedLocaleId, setSelectedLocaleId] = useState(null);
  const [addingLanguage, setAddingLanguage] = useState(false);

  // Modal controls
  const [addContentModalOpened, { open: openAddContentModal, close: closeAddContentModal }] =
    useDisclosure(false);

  // Initialize with default template content using the site's default language
  useEffect(() => {
    if (locales?.length > 0 && initialRecord?.contents?.length === 0 && siteSettings) {
      console.log('Initializing default template content...');
      // Get the default language ID from site settings
      const defaultLanguageId = siteSettings.default_language_id;

      // Find the locale that matches the default language ID
      const defaultLocale = defaultLanguageId
        ? locales.find((locale) => locale.id === defaultLanguageId)
        : locales.find((locale) => locale.iso_code.toLowerCase() === 'en'); // Fallback to en if no default is set

      console.log('Default locale found:', defaultLocale);

      if (defaultLocale) {
        const newId = 1;

        // Template content structure
        const defaultTemplateContent = {
          _addNew: true,
          id: newId,
          content: `<h1>Welcome to {{ settings.name }}!</h1>

<p>This is a sample template demonstrating basic Jinja2 features available in your CMS.</p>

<!-- Variables -->
<h2>Variables</h2>
<p>Organization: {{ settings.name }}</p>
<p>ID: {{ settings.id }}</p>

<!-- Conditionals -->
<h2>Conditionals</h2>
{% if settings.show_chatbox %}
<p>✅ Chatbox is enabled</p>
{% else %}
<p>❌ Chatbox is disabled</p>
{% endif %}

<!-- Loops -->
<h2>Domains</h2>
{% if settings.domains %}
<ul>
{% for domain in settings.domains %}
    <li>{{ domain }}</li>
{% endfor %}
</ul>
{% else %}
<p>No domains configured</p>
{% endif %}

<!-- Template Inheritance Example -->
<h2>Template Features</h2>
<p>Use <code>{% raw %}{% extends "template_name" %}{% endraw %}</code> to inherit from other templates.</p>
<p>Use <code>{% raw %}{% include "template_name" %}{% endraw %}</code> to include other templates.</p>

<!-- Comments -->
{# This is a Jinja2 comment - it won't be visible in the output #}

<p><em>Edit this template to create your own content!</em></p>`,
          locale_id: defaultLocale.id,
          locale: defaultLocale,
        };

        console.log('Creating default template content:', defaultTemplateContent);

        setRecord((prev) => ({
          ...prev,
          contents: [defaultTemplateContent],
        }));

        setActiveContentTab(String(newId));
      }
    }
  }, [locales, siteSettings, initialRecord, setRecord]);

  // Set initial active tab if contents exist
  useEffect(() => {
    if (initialRecord?.contents?.length > 0 && !activeContentTab) {
      // Sort contents by ID (oldest first) and select the first one
      const sortedContents = [...initialRecord.contents].sort((a, b) => a.id - b.id);
      setActiveContentTab(String(sortedContents[0].id));
    }
  }, [initialRecord?.contents, activeContentTab]);

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
    return locale ? locale.emoji_flag : null;
  };

  /**
   * Update a specific field in a template content item
   */
  const updateContentField = (contentId, field, value) => {
    setRecord((prev) => ({
      ...prev,
      contents: prev.contents.map((content) =>
        String(content.id) === String(contentId) ? { ...content, [field]: value } : content,
      ),
    }));
  };

  /**
   * Handle adding a new language content
   */
  const handleAddContent = () => {
    if (!locales || locales.length === 0) {
      notify({
        message: t('No languages available'),
        type: 'error',
      });
      return;
    }

    // Filter out locales that already have content
    const availableLocales = locales.filter(
      (locale) => !initialRecord.contents.some((content) => content.locale_id === locale.id),
    );

    if (availableLocales.length === 0) {
      notify({
        message: t('All languages already have content'),
        type: 'info',
      });
      return;
    }

    openAddContentModal();
  };

  /**
   * Handle deleting a language content
   */
  const handleDeleteContent = (contentId) => {
    modals.openConfirmModal({
      title: t('Delete Content'),
      children: t('Are you sure you want to delete this language content?'),
      labels: { confirm: t('Delete'), cancel: t('Cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        setRecord((prev) => ({
          ...prev,
          contents: prev.contents.filter((content) => String(content.id) !== String(contentId)),
        }));

        // If we deleted the active content, switch to another one
        if (String(contentId) === activeContentTab) {
          const remainingContents = initialRecord.contents.filter(
            (content) => String(content.id) !== String(contentId),
          );
          if (remainingContents.length > 0) {
            setActiveContentTab(String(remainingContents[0].id));
          } else {
            setActiveContentTab(null);
          }
        }
      },
    });
  };

  /**
   * Handle submitting a new language content
   */
  const handleAddContentSubmit = async () => {
    if (!selectedLocaleId) {
      notify({
        message: t('Please select a language'),
        type: 'error',
      });
      return;
    }

    try {
      setAddingLanguage(true);

      // Find the selected locale
      const selectedLocale = locales.find((locale) => locale.id === selectedLocaleId);

      if (!selectedLocale) {
        throw new Error('Selected locale not found');
      }

      // Generate new ID (find the highest existing ID and add 1)
      const existingIds = initialRecord.contents.map((c) => c.id);
      const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

      // Create new template content
      const newTemplateContent = {
        _addNew: true,
        id: newId,
        content: `<h1>Welcome to {{ settings.name }}!</h1>

<p>This is a sample template demonstrating basic Jinja2 features available in your CMS.</p>

<!-- Variables -->
<h2>Variables</h2>
<p>Organization: {{ settings.name }}</p>
<p>ID: {{ settings.id }}</p>

<!-- Conditionals -->
<h2>Conditionals</h2>
{% if settings.show_chatbox %}
<p>✅ Chatbox is enabled</p>
{% else %}
<p>❌ Chatbox is disabled</p>
{% endif %}

<!-- Loops -->
<h2>Domains</h2>
{% if settings.domains %}
<ul>
{% for domain in settings.domains %}
    <li>{{ domain }}</li>
{% endfor %}
</ul>
{% else %}
<p>No domains configured</p>
{% endif %}

<!-- Template Inheritance Example -->
<h2>Template Features</h2>
<p>Use <code>{% raw %}{% extends "template_name" %}{% endraw %}</code> to inherit from other templates.</p>
<p>Use <code>{% raw %}{% include "template_name" %}{% endraw %}</code> to include other templates.</p>

<!-- Comments -->
{# This is a Jinja2 comment - it won't be visible in the output #}

<p><em>Edit this template to create your own content!</em></p>`,
        locale_id: selectedLocale.id,
        locale: selectedLocale,
      };

      // Add to record
      setRecord((prev) => ({
        ...prev,
        contents: [...prev.contents, newTemplateContent],
      }));

      // Switch to the new content tab
      setActiveContentTab(String(newId));

      // Close modal and reset form
      closeAddContentModal();
      setSelectedLocaleId(null);

      notify({
        message: t('Language content added successfully'),
        type: 'success',
      });
    } catch (error) {
      console.error('Error adding template content:', error);
      notify({
        message: error.message || t('Failed to add language content'),
        type: 'error',
      });
    } finally {
      setAddingLanguage(false);
    }
  };

  /**
   * Process contents for submission (remove client-side only fields)
   */
  const processContentsForSubmit = (contents) => {
    return contents.map((content) => {
      const { _addNew, ...cleanContent } = content;

      // For new content (marked with _addNew), remove the temporary id
      // The backend will assign proper IDs
      if (_addNew) {
        // eslint-disable-next-line no-unused-vars
        const { id, ...contentWithoutId } = cleanContent;
        return contentWithoutId;
      }

      return cleanContent;
    });
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
    closeAddContentModal,

    // Content manipulation functions
    updateContentField,
    handleAddContent,
    handleDeleteContent,
    handleAddContentSubmit,

    // Submission helpers
    processContentsForSubmit,

    // Utility functions
    getLanguageName,
    getLanguageFlag,
  };
}
