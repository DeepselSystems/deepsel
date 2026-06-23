import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@mantine/core';
import {
  IconKey,
  IconMessage,
  IconPlugConnected,
  IconPlugConnectedX,
  IconRobot,
} from '@tabler/icons-react';
import { useAIProviderConfig } from '../../../../common/AIProviderConfigContext.js';
import ConnectOpenRouterModal from '../../../../common/ui/ConnectOpenRouterModal.jsx';
import H2 from '../../../../common/ui/H2.jsx';
import RecordSelect from '../../../../common/ui/RecordSelect.jsx';
import SecretInput from '../../../../common/ui/SecretInput.jsx';
import Switch from '../../../../common/ui/Switch.jsx';
import useModel from '../../../../common/api/useModel.jsx';
import NotificationState from '../../../../common/stores/NotificationState.js';
import BackendHostURLState from '../../../../common/stores/BackendHostURLState.js';
import SitePublicSettingsState from '../../../../common/stores/SitePublicSettingsState.js';
import SiteSettingsSection from './SiteSettingsSection.jsx';

export default function SiteSettingsAI() {
  const { t } = useTranslation();
  const { notify } = NotificationState((state) => state);
  const aiProviderConfig = useAIProviderConfig();

  const [openrouterApiKeyEditing, setOpenrouterApiKeyEditing] = useState('');
  const [connectModalOpened, setConnectModalOpened] = useState(false);

  const { data: openRouterModels } = useModel('openrouter_model', {
    autoFetch: true,
    pageSize: 1000,
  });

  return (
    <SiteSettingsSection
      title={t('AI')}
      onSubmit={async ({ record, update }) => {
        await update({
          ...record,
          openrouter_api_key: openrouterApiKeyEditing,
        });
      }}
    >
      {({ record, setRecord, refetchOrg, organizationId }) => (
        <AIBody
          record={record}
          setRecord={setRecord}
          refetchOrg={refetchOrg}
          organizationId={organizationId}
          openRouterModels={openRouterModels}
          aiProviderConfig={aiProviderConfig}
          openrouterApiKeyEditing={openrouterApiKeyEditing}
          setOpenrouterApiKeyEditing={setOpenrouterApiKeyEditing}
          connectModalOpened={connectModalOpened}
          setConnectModalOpened={setConnectModalOpened}
          notify={notify}
          t={t}
        />
      )}
    </SiteSettingsSection>
  );
}

function AIBody({
  record,
  setRecord,
  refetchOrg,
  organizationId,
  openRouterModels,
  aiProviderConfig,
  openrouterApiKeyEditing,
  setOpenrouterApiKeyEditing,
  connectModalOpened,
  setConnectModalOpened,
  notify,
  t,
}) {
  useEffect(() => {
    if (!openRouterModels || !record) return;

    const translationModel = openRouterModels.find(
      (model) => model.string_id === 'google/gemini-flash-1.5-8b',
    );

    if (!record.ai_translation_model_id && translationModel) {
      setRecord((prev) => ({
        ...prev,
        ai_translation_model_id: translationModel.id,
      }));
    }
  }, [record?.id, openRouterModels]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <IconRobot size={16} className="text-gray-600" />
          <H2>{t('AI Writing')}</H2>
        </div>

        <Text c="dimmed" size="sm" className="mb-2">
          {t(
            'Configure AI-powered content generation and translation features. Requires an OpenRouter API key to function.',
          )}
        </Text>

        <div className="relative grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            {aiProviderConfig.mode === 'oauth' ? (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <IconPlugConnected size={16} className="text-gray-500" />
                  <Text size="sm" weight={500}>
                    {t('AI Provider')}
                  </Text>
                </div>
                {record.openrouter_api_key_truncated ? (
                  <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <IconPlugConnected size={20} className="text-green-600" />
                    <div className="flex-1">
                      <Text size="sm" weight={600} className="text-green-700">
                        {t('OpenRouter Connected')}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {record.openrouter_api_key_truncated}
                      </Text>
                    </div>
                    <Button
                      variant="subtle"
                      color="red"
                      size="xs"
                      leftSection={<IconPlugConnectedX size={14} />}
                      onClick={async () => {
                        const { backendHost } = BackendHostURLState.getState();
                        await fetch(`${backendHost}/openrouter/disconnect`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ organization_id: organizationId }),
                        });
                        const res = await fetch(
                          `${backendHost}/util/public_settings/${organizationId}`,
                          { credentials: 'include' },
                        );
                        if (res.ok) {
                          const data = await res.json();
                          SitePublicSettingsState.getState().setSettings(data);
                          setRecord({ ...record, openrouter_api_key_truncated: null });
                        }
                        notify({ message: t('OpenRouter disconnected'), type: 'success' });
                      }}
                    >
                      {t('Disconnect')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    leftSection={<IconPlugConnected size={16} />}
                    onClick={() => setConnectModalOpened(true)}
                    fullWidth
                  >
                    {t('Connect OpenRouter Account')}
                  </Button>
                )}
                <ConnectOpenRouterModal
                  opened={connectModalOpened}
                  onClose={() => setConnectModalOpened(false)}
                  onConnected={() => refetchOrg(organizationId)}
                />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <IconKey size={16} className="text-gray-500" />
                  <Text size="sm" weight={500}>
                    {t('API Keys')}
                  </Text>
                </div>

                <SecretInput
                  label={t('OpenRouter API Key')}
                  description={t(
                    'API key for AI-powered translation and content generation features',
                  )}
                  truncateSecret={record.openrouter_api_key_truncated}
                  editingValue={openrouterApiKeyEditing}
                  setEditingValue={(value) => setOpenrouterApiKeyEditing(value)}
                />
              </>
            )}

            <RecordSelect
              model="openrouter_model"
              displayField="string_id"
              pageSize={1000}
              searchFields={['string_id', 'name']}
              label={t('Translation model')}
              description={t('AI model used for translating content between languages')}
              placeholder={t('Select an AI model')}
              value={record?.ai_translation_model_id}
              onChange={(value) =>
                setRecord({
                  ...record,
                  ai_translation_model_id: value,
                })
              }
              className="my-4"
            />

            <RecordSelect
              model="openrouter_model"
              displayField="string_id"
              className="my-2"
              pageSize={1000}
              searchFields={['string_id', 'name']}
              label={t('Default writing model')}
              description={t('Default AI model for generating new content')}
              placeholder={t('Select an AI model')}
              value={record?.ai_default_writing_model_id}
              onChange={(value) =>
                setRecord({
                  ...record,
                  ai_default_writing_model_id: value,
                })
              }
            />

            <RecordSelect
              model="openrouter_model"
              displayField="string_id"
              className="my-2"
              pageSize={1000}
              searchFields={['string_id', 'name']}
              label={t('Autocomplete model')}
              description={t('AI model used for text autocomplete and suggestions')}
              placeholder={t('Select an AI model')}
              value={record?.ai_autocomplete_model_id}
              onChange={(value) =>
                setRecord({
                  ...record,
                  ai_autocomplete_model_id: value,
                })
              }
            />
          </div>

          <div>
            <Switch
              label={t('Auto-translate Pages')}
              description={t('Automatically translate page content when adding new languages')}
              checked={record.auto_translate_pages || false}
              onChange={(event) =>
                setRecord({
                  ...record,
                  auto_translate_pages: event.currentTarget.checked,
                })
              }
              className="mb-4"
            />

            <Switch
              label={t('Auto-translate Blog Posts')}
              description={t('Automatically translate blog post content when adding new languages')}
              checked={record.auto_translate_posts || false}
              onChange={(event) =>
                setRecord({
                  ...record,
                  auto_translate_posts: event.currentTarget.checked,
                })
              }
              className="mb-4"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <IconMessage size={16} className="text-gray-600" />
          <H2>{t('Website AI Assistant')}</H2>
        </div>

        <Text c="dimmed" size="sm" className="mb-2">
          {t(
            'Enable the website AI assistant in a popup chat box to help users with their queries and provide support.',
          )}
        </Text>

        <div className="relative grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <Switch
              label={t('Enabled')}
              description={t(
                'Show AI assistant chat widget on website pages. Only visible if your theme supports it.',
              )}
              checked={record.show_chatbox || false}
              onChange={(event) =>
                setRecord({
                  ...record,
                  show_chatbox: event.currentTarget.checked,
                })
              }
              className="mb-4"
            />
          </div>

          <div>
            <RecordSelect
              model="openrouter_model"
              displayField="string_id"
              pageSize={1000}
              searchFields={['string_id', 'name']}
              label={t('Chat model')}
              description={t('AI model used for the chat assistant')}
              placeholder={t('Select an AI model')}
              value={record?.chatbox_model_id}
              onChange={(value) =>
                setRecord({
                  ...record,
                  chatbox_model_id: value,
                })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
