import { Accordion, Modal } from '@mantine/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import SitePublicSettingsState from '../../../../common/stores/SitePublicSettingsState.js';

/**
 * Static Jinja2 control-flow snippets
 */
const JINJA2_SNIPPETS = [
  { name: 'Include template', snippet: "{% include 'TemplateName' %}" },
  {
    name: 'Include with params',
    snippet: "{% with title='...' %}{% include 'TemplateName' %}{% endwith %}",
  },
  {
    name: 'Extends layout',
    snippet: "{% extends 'TemplateName' %}\n{% block content %}\n  \n{% endblock %}",
  },
  { name: 'Block definition', snippet: '{% block blockName %}\n  \n{% endblock %}' },
  {
    name: 'Loop over main menu',
    snippet:
      '{% for item in settings.menus %}\n  <a href="{{ item.url }}">{{ item.title }}</a>\n{% endfor %}',
  },
  { name: 'Loop over list', snippet: '{% for item in list %}\n  {{ item }}\n{% endfor %}' },
  {
    name: 'If / else',
    snippet: '{% if condition %}\n  \n{% else %}\n  \n{% endif %}',
  },
  { name: 'Default filter', snippet: "{{ variable | default('fallback') }}" },
  { name: 'Escape (HTML-safe)', snippet: '{{ variable | e }}' },
];

/**
 * User context variables — available only when a user is authenticated
 */
const USER_VARIABLES = [
  { name: 'Guard: only when logged in', snippet: '{% if user %}\n  \n{% endif %}' },
  { name: 'User ID', snippet: '{{ user.id }}' },
  { name: 'Username', snippet: '{{ user.name }}' },
  { name: 'First Name', snippet: '{{ user.first_name }}' },
  { name: 'Last Name', snippet: '{{ user.last_name }}' },
];

/**
 * attachment() global function call snippets
 */
const ATTACHMENT_SNIPPETS = [
  { name: 'Single attachment URL', snippet: "{{ attachment('name') }}" },
  { name: 'With resize (width)', snippet: "{{ attachment('name', {'width': 400}) }}" },
  { name: 'Gallery (list)', snippet: "{{ attachment('img1', 'img2', 'img3') }}" },
];

/**
 * Modal showing all available Jinja2 variables and snippets for template editing.
 * Clicking any item appends it to the template content.
 *
 * @param {boolean} opened - Whether the modal is visible
 * @param {function} onClose - Called when the modal should close
 * @param {function} onInsert - Called with the snippet text to insert
 */
export default function VariablesModal({ opened, onClose, onInsert }) {
  const { t } = useTranslation();
  const { settings: siteSettings } = SitePublicSettingsState();

  /**
   * Available settings variables
   */
  const settingsVariables = useMemo(() => {
    if (!siteSettings) return [];

    const variables = [];

    variables.push({ name: 'Organization Name', path: 'settings.name' });
    variables.push({ name: 'Organization ID', path: 'settings.id' });

    if (siteSettings.default_language) {
      variables.push({ name: 'Default Language Name', path: 'settings.default_language.name' });
      variables.push({ name: 'Default Language Code', path: 'settings.default_language.iso_code' });
      variables.push({
        name: 'Default Language Flag',
        path: 'settings.default_language.emoji_flag',
      });
    }

    if (siteSettings.domains) {
      variables.push({ name: 'Domains', path: 'settings.domains' });
    }

    variables.push({ name: 'Show Post Author', path: 'settings.show_post_author' });
    variables.push({ name: 'Show Post Date', path: 'settings.show_post_date' });
    variables.push({ name: 'Show Chatbox', path: 'settings.show_chatbox' });
    variables.push({ name: 'Auto Translate Pages', path: 'settings.auto_translate_pages' });
    variables.push({ name: 'Auto Translate Posts', path: 'settings.auto_translate_posts' });
    variables.push({
      name: 'Auto Translate Components',
      path: 'settings.auto_translate_components',
    });
    variables.push({ name: 'Has OpenAI Key', path: 'settings.has_openai_api_key' });
    variables.push({ name: 'Has OpenRouter Key', path: 'settings.has_openrouter_api_key' });

    if (siteSettings.website_custom_code) {
      variables.push({ name: 'Website Custom Code', path: 'settings.website_custom_code' });
    }

    if (siteSettings.menus) {
      variables.push({ name: 'Main Menu', path: 'settings.menus' });
    }

    return variables;
  }, [siteSettings]);

  const handleInsert = (text) => {
    onInsert(text);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<div className="font-bold">{t('Available Variables & Snippets')}</div>}
      size="xl"
      radius={0}
      transitionProps={{ transition: 'fade', duration: 200 }}
    >
      <p className="text-sm text-gray-500 mb-3">
        {t('Click any item to append it to your template.')}
      </p>
      <Accordion
        multiple
        defaultValue={['jinja2', 'user', 'attachment', 'settings']}
        variant="separated"
      >
        {/* Jinja2 control-flow snippets */}
        <Accordion.Item value="jinja2">
          <Accordion.Control>
            <span className="font-medium text-teal-700">{t('Jinja2 Snippets')}</span>
            <span className="text-xs text-gray-400 ml-2">{t('includes, loops, conditions')}</span>
          </Accordion.Control>
          <Accordion.Panel>
            <div className="space-y-1">
              {JINJA2_SNIPPETS.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between gap-4 px-3 py-2 rounded cursor-pointer hover:bg-teal-50 border border-transparent hover:border-teal-100"
                  onClick={() => handleInsert(item.snippet)}
                >
                  <span className="text-sm font-medium text-gray-700 shrink-0">{t(item.name)}</span>
                  <code className="text-xs text-gray-400 font-mono truncate">
                    {item.snippet.split('\n')[0]}
                  </code>
                </div>
              ))}
            </div>
          </Accordion.Panel>
        </Accordion.Item>

        {/* User context variables */}
        <Accordion.Item value="user">
          <Accordion.Control>
            <span className="font-medium text-purple-700">{t('User Variables')}</span>
            <span className="text-xs text-gray-400 ml-2">{t('available when logged in')}</span>
          </Accordion.Control>
          <Accordion.Panel>
            <div className="space-y-1">
              {USER_VARIABLES.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between gap-4 px-3 py-2 rounded cursor-pointer hover:bg-purple-50 border border-transparent hover:border-purple-100"
                  onClick={() => handleInsert(item.snippet)}
                >
                  <span className="text-sm font-medium text-gray-700 shrink-0">{t(item.name)}</span>
                  <code className="text-xs text-gray-400 font-mono truncate">
                    {item.snippet.split('\n')[0]}
                  </code>
                </div>
              ))}
            </div>
          </Accordion.Panel>
        </Accordion.Item>

        {/* attachment() function */}
        <Accordion.Item value="attachment">
          <Accordion.Control>
            <span className="font-medium text-orange-700">{t('Attachment Function')}</span>
            <span className="text-xs text-gray-400 ml-2">{t('fetch file/image URLs by name')}</span>
          </Accordion.Control>
          <Accordion.Panel>
            <div className="space-y-1">
              {ATTACHMENT_SNIPPETS.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between gap-4 px-3 py-2 rounded cursor-pointer hover:bg-orange-50 border border-transparent hover:border-orange-100"
                  onClick={() => handleInsert(item.snippet)}
                >
                  <span className="text-sm font-medium text-gray-700 shrink-0">{t(item.name)}</span>
                  <code className="text-xs text-gray-400 font-mono truncate">{item.snippet}</code>
                </div>
              ))}
            </div>
          </Accordion.Panel>
        </Accordion.Item>

        {/* Settings variables */}
        <Accordion.Item value="settings">
          <Accordion.Control>
            <span className="font-medium text-blue-700">{t('Settings Variables')}</span>
          </Accordion.Control>
          <Accordion.Panel>
            <div className="space-y-1">
              {settingsVariables.map((item) => (
                <div
                  key={item.path}
                  className="flex items-center justify-between gap-4 px-3 py-2 rounded cursor-pointer hover:bg-blue-50 border border-transparent hover:border-blue-100"
                  onClick={() => handleInsert('{{ ' + item.path + ' }}')}
                >
                  <span className="text-sm font-medium text-gray-700 shrink-0">{t(item.name)}</span>
                  <code className="text-xs text-gray-400 font-mono">
                    {'{{ ' + item.path + ' }}'}
                  </code>
                </div>
              ))}
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Modal>
  );
}
