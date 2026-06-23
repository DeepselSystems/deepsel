import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconX } from '@tabler/icons-react';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';

/**
 * OpenRouter OAuth callback page — runs inside popup.
 * Exchanges the auth code for an API key, notifies parent window, then closes.
 */
export default function OpenRouterCallback() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('processing');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (!code) {
      setStatus('error');
      return;
    }

    const codeVerifier = sessionStorage.getItem('openrouter_code_verifier');
    sessionStorage.removeItem('openrouter_code_verifier');

    const exchangeCode = async () => {
      try {
        const { backendHost } = BackendHostURLState.getState();
        const { organizationId } = OrganizationIdState.getState();

        const response = await fetch(`${backendHost}/openrouter/exchange-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            code,
            organization_id: organizationId,
            code_verifier: codeVerifier || undefined,
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.detail || 'Exchange failed');
        }

        // Notify parent window via BroadcastChannel
        const channel = new BroadcastChannel('openrouter-oauth');
        channel.postMessage({ type: 'OPENROUTER_CONNECTED' });
        channel.close();

        setStatus('success');
        setTimeout(() => window.close(), 1500);
      } catch (err) {
        console.error('OpenRouter exchange failed:', err);
        setStatus('error');
      }
    };

    exchangeCode();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center bg-white rounded-xl shadow-lg p-8 max-w-sm mx-4">
        {status === 'processing' && (
          <>
            <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-600 font-medium">{t('Connecting...')}</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <IconCheck size={24} className="text-green-600" />
            </div>
            <p className="text-green-700 font-semibold text-lg mb-1">{t('Connected!')}</p>
            <p className="text-gray-500 text-sm">{t('This window will close automatically.')}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <IconX size={24} className="text-red-600" />
            </div>
            <p className="text-red-700 font-semibold">{t('Connection failed')}</p>
            <p className="text-gray-500 text-sm mt-1">
              {t('Please close this window and try again.')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
