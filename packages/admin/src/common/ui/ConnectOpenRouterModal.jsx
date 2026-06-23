import { useEffect, useState } from 'react';
import { Modal } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import Button from './Button.jsx';
import { IconPlugConnected } from '@tabler/icons-react';
import { useAIProviderConfig } from '../AIProviderConfigContext.js';
import { useBasename } from '../BasenameContext.js';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import OrganizationIdState from '../stores/OrganizationIdState.js';
import SitePublicSettingsState from '../stores/SitePublicSettingsState.js';
import NotificationState from '../stores/NotificationState.js';

// PKCE helpers
async function generatePKCE() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { codeVerifier, codeChallenge };
}

export default function ConnectOpenRouterModal({ opened, onClose, onConnected }) {
  const { t } = useTranslation();
  const { oauthCallbackPath } = useAIProviderConfig();
  const basename = useBasename();
  const [connecting, setConnecting] = useState(false);

  // Listen for success signal from popup via BroadcastChannel
  useEffect(() => {
    const channel = new BroadcastChannel('openrouter-oauth');
    channel.onmessage = async (event) => {
      if (event.data?.type !== 'OPENROUTER_CONNECTED') return;

      // Popup already exchanged the code — just refresh settings
      setConnecting(true);
      try {
        const { backendHost } = BackendHostURLState.getState();
        const { organizationId } = OrganizationIdState.getState();

        const settingsRes = await fetch(`${backendHost}/util/public_settings/${organizationId}`, {
          credentials: 'include',
        });
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          SitePublicSettingsState.getState().setSettings(data);
        }

        NotificationState.getState().notify({
          message: t('OpenRouter connected successfully!'),
          type: 'success',
        });
        if (onConnected) onConnected();
        onClose();
      } catch (err) {
        console.error('Failed to refresh settings:', err);
      } finally {
        setConnecting(false);
      }
    };
    return () => channel.close();
  }, [onClose, t]);

  const handleConnect = async () => {
    const { codeVerifier, codeChallenge } = await generatePKCE();
    sessionStorage.setItem('openrouter_code_verifier', codeVerifier);

    const callbackUrl = `${window.location.origin}${basename}${oauthCallbackPath}`;
    const params = new URLSearchParams({
      callback_url: callbackUrl,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      site_url: window.location.origin,
      site_name: document.title || 'CMS Admin',
    });
    window.open(
      `https://openrouter.ai/auth?${params.toString()}`,
      'openrouter-auth',
      'width=600,height=700',
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<div className="font-semibold text-lg">{t('Connect AI Provider')}</div>}
      size={450}
      centered
    >
      <div className="py-4 text-center">
        <IconPlugConnected size={48} className="mx-auto mb-4 text-blue-500" />
        <p className="text-gray-700 mb-6">
          {t(
            'Connect your OpenRouter account to use AI-powered features like autocomplete, content generation, and translation.',
          )}
        </p>
        <Button
          onClick={handleConnect}
          className="w-full"
          size="lg"
          loading={connecting}
          disabled={connecting}
        >
          <IconPlugConnected size={18} className="mr-2" />
          {connecting ? t('Connecting...') : t('Connect OpenRouter')}
        </Button>
      </div>
    </Modal>
  );
}
