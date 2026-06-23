import { Modal } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import NotificationState from '../stores/NotificationState.js';
import Button from '../ui/Button.jsx';
import { IconCheck, IconCircleCheck, IconCopy, IconDownload } from '@tabler/icons-react';
export default function RecoveryCodesModal({ isOpen, close, onFinish, recoveryCodes = [] }) {
  const { t } = useTranslation();
  const { notify } = NotificationState((state) => state);

  function handleCopy() {
    const textToCopy = (recoveryCodes || []).join('\n');
    navigator.clipboard.writeText(textToCopy);
    notify({
      message: t('Recovery codes copied to clipboard!'),
      type: 'success',
      duration: 1000,
    });
  }

  function handleDownload() {
    const textToDownload = (recoveryCodes || []).join('\n');
    const blob = new Blob([textToDownload], {
      type: 'text/plain',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recovery-codes.txt';
    a.click();
    window.URL.revokeObjectURL(url);
  }

  function handleCLose() {
    if (onFinish && typeof onFinish === 'function') {
      onFinish();
    }
    close();
  }

  return (
    <Modal
      styles={{
        body: {
          paddingLeft: 0,
          paddingRight: 0,
        },
      }}
      opened={isOpen}
      onClose={handleCLose}
      size={650}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      title={
        <div className="flex items-center gap-4 px-4">
          <IconCircleCheck size={24} className="text-[#4DB783] self-start" />
          <div className={`font-semibold text-lg`}>
            {t('Two-Factor Authentication - Enabled via Authenticator App')}
          </div>
        </div>
      }
    >
      <div className="px-8 py-6 bg-[#F7F9FA]">
        <div className="text-[#E2393E] font-bold text-lg">{t('Recovery Codes')}</div>
        <div className="mt-4 text-[#85909A]">
          {t(
            'Recovery codes are the backup codes to access your account in case you cannot receive two-factor authentication codes via the authenticator app.',
          )}
        </div>
        <div className="mt-2 text-[#85909A]">
          {t(
            'Make a copy or download these codes and keep them somewhere safe before you continue further.',
          )}
        </div>
        <div className="grid grid-cols-2 gap-y-2 my-8 text-[#26445A] font-semibold">
          {recoveryCodes.map((code) => (
            <div key={code} className="text-xl">
              {code}
            </div>
          ))}
        </div>
        <div className="flex">
          <Button className="!bg-gray-300 !text-[#14354C]" onClick={handleDownload}>
            <IconDownload size={16} className="mr-2" />
            {t('Download')}
          </Button>
          <Button className="ml-2 !bg-gray-300 !text-[#14354C]" onClick={handleCopy}>
            <IconCopy size={16} className="mr-2" />
            {t('Copy')}
          </Button>
        </div>
      </div>
      <Button className="ml-8 mt-8" onClick={handleCLose}>
        <IconCheck size={16} className="mr-2" />
        {t('Finish Setup')}
      </Button>
    </Modal>
  );
}
