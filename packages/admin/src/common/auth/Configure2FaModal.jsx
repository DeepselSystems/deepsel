import { LoadingOverlay, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useFetch from '../api/useFetch.js';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import OrganizationIdState from '../stores/OrganizationIdState.js';
import NotificationState from '../stores/NotificationState.js';
import Button from '../ui/Button.jsx';
import TextInput from '../ui/TextInput.jsx';
import { IconCheck, IconShield, IconShieldOff } from '@tabler/icons-react';

export default function Configure2FaModal({ isOpen, close, onConfirmUsed2Fa = () => {} }) {
  const { t } = useTranslation();
  const { get: get2FaConfig } = useFetch(`user/me/2fa-config`);
  const { backendHost } = BackendHostURLState();
  const { organizationId } = OrganizationIdState();
  const { notify } = NotificationState((state) => state);

  const orgHeader = organizationId ? { 'X-Organization-Id': String(organizationId) } : {};
  const [visible, { open: openLoading, close: closeLoading }] = useDisclosure(false);

  const [is2FaEnabled, setIs2FaEnabled] = useState(false);
  const [step, setStep] = useState('idle'); // idle | qr | confirm-disable
  const [urlQrCode, setUrlQrCode] = useState('');
  const [otp, setOtp] = useState('');

  // Fetch current 2FA status when modal opens
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      openLoading();
      try {
        const config = await get2FaConfig();
        setIs2FaEnabled(config?.is_use_2fa || false);
        setStep('idle');
        setUrlQrCode('');
        setOtp('');
      } finally {
        closeLoading();
      }
    })();
  }, [isOpen]);

  // Step 1: Start 2FA setup — get QR code
  async function handleSetup() {
    openLoading();
    try {
      const response = await fetch(`${backendHost}/user/me/2fa-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...orgHeader },
        credentials: 'include',
        body: JSON.stringify({ action: 'setup' }),
      });
      const result = await response.json();
      if (!response.ok) {
        notify({ message: result?.detail || t('Failed to setup 2FA'), type: 'error' });
        return;
      }
      if (result.totp_uri) {
        const qrDataUrl = await QRCode.toDataURL(result.totp_uri, { type: 'image/png' });
        setUrlQrCode(qrDataUrl);
        setStep('qr');
        setOtp('');
      }
    } catch (error) {
      notify({ message: error.message, type: 'error' });
    } finally {
      closeLoading();
    }
  }

  // Step 2: Confirm OTP to activate 2FA
  async function handleConfirm(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.target.reportValidity()) return;

    openLoading();
    try {
      const response = await fetch(`${backendHost}/user/me/2fa-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...orgHeader },
        credentials: 'include',
        body: JSON.stringify({ action: 'confirm', otp }),
      });
      const result = await response.json();
      if (!response.ok) {
        notify({ message: result?.detail || t('Invalid OTP'), type: 'error' });
        setOtp('');
        return;
      }

      setIs2FaEnabled(true);
      setStep('idle');
      setUrlQrCode('');
      setOtp('');
      notify({ message: t('Two-Factor Authentication enabled!'), type: 'success' });
      close();

      if (result?.recovery_codes?.length) {
        onConfirmUsed2Fa(result.recovery_codes);
      }
    } catch (error) {
      notify({ message: error.message, type: 'error' });
    } finally {
      closeLoading();
    }
  }

  // Disable 2FA with OTP confirmation
  async function handleDisable(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.target.reportValidity()) return;

    openLoading();
    try {
      const response = await fetch(`${backendHost}/user/me/2fa-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...orgHeader },
        credentials: 'include',
        body: JSON.stringify({ action: 'disable', otp }),
      });
      const result = await response.json();
      if (!response.ok) {
        notify({ message: result?.detail || t('Invalid OTP'), type: 'error' });
        setOtp('');
        return;
      }

      setIs2FaEnabled(false);
      setStep('idle');
      setOtp('');
      notify({ message: t('Two-Factor Authentication disabled'), type: 'success' });
      close();
    } catch (error) {
      notify({ message: error.message, type: 'error' });
    } finally {
      closeLoading();
    }
  }

  return (
    <Modal
      opened={isOpen}
      onClose={() => {
        setStep('idle');
        setOtp('');
        close();
      }}
      title={
        <div className="font-semibold text-lg">{t('Configure Two Factor Authentication')}</div>
      }
      size={500}
    >
      <LoadingOverlay
        visible={visible}
        zIndex={1000}
        overlayProps={{ radius: 'sm', blur: 2 }}
        loaderProps={{ color: 'pink', type: 'bars' }}
      />

      <div className="border-t py-4">
        {/* Idle state: show current status and action buttons */}
        {step === 'idle' && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <IconShield size={20} className={is2FaEnabled ? 'text-green-600' : 'text-gray-400'} />
              <span>
                {is2FaEnabled
                  ? t('Two-Factor Authentication is enabled')
                  : t('Two-Factor Authentication is not enabled')}
              </span>
            </div>

            {is2FaEnabled ? (
              <Button
                color="red"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setStep('confirm-disable');
                  setOtp('');
                }}
              >
                <IconShieldOff size={16} className="mr-1" />
                {t('Disable 2FA')}
              </Button>
            ) : (
              <Button className="w-full" onClick={handleSetup}>
                <IconShield size={16} className="mr-1" />
                {t('Enable 2FA')}
              </Button>
            )}
          </div>
        )}

        {/* QR code step: scan and enter OTP to confirm */}
        {step === 'qr' && (
          <form onSubmit={handleConfirm}>
            <div className="text-sm text-gray-600 mb-4">
              {t(
                'Scan the QR code below with your authenticator app (e.g. Google Authenticator), then enter the 6-digit code to verify.',
              )}
            </div>

            {urlQrCode && (
              <img src={urlQrCode} className="w-[200px] h-[200px] mx-auto mb-4" alt="2FA QR Code" />
            )}

            <TextInput
              label={t('Enter verification code')}
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
              autoFocus
              autoComplete="one-time-code"
              className="mb-4"
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setStep('idle');
                  setOtp('');
                }}
              >
                {t('Cancel')}
              </Button>
              <Button type="submit" className="flex-1">
                <IconCheck size={16} className="mr-1" />
                {t('Verify & Enable')}
              </Button>
            </div>
          </form>
        )}

        {/* Disable confirmation step */}
        {step === 'confirm-disable' && (
          <form onSubmit={handleDisable}>
            <div className="text-sm text-gray-600 mb-4">
              {t('Enter your authenticator code to disable Two-Factor Authentication.')}
            </div>

            <TextInput
              label={t('Enter verification code')}
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
              autoFocus
              autoComplete="one-time-code"
              className="mb-4"
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setStep('idle');
                  setOtp('');
                }}
              >
                {t('Cancel')}
              </Button>
              <Button type="submit" color="red" className="flex-1">
                <IconShieldOff size={16} className="mr-1" />
                {t('Disable 2FA')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
