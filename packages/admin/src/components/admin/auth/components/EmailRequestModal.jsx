import { Modal } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import TextInput from '../../../../common/ui/TextInput.jsx';
import Button from '../../../../common/ui/Button.jsx';

/**
 * Reusable modal with a single email input field and submit button.
 * Used for both the reset-password and passwordless login flows.
 *
 * @param {boolean} opened - Whether the modal is visible.
 * @param {function} onClose - Called when the modal is dismissed.
 * @param {string} title - Modal heading text.
 * @param {string} [description] - Optional explanatory text shown above the form.
 * @param {string} email - Current email input value.
 * @param {function} onEmailChange - Called with the change event for the email input.
 * @param {function} onSubmit - Form submit handler.
 * @param {boolean} loading - When true, the Submit button shows a loading state.
 */
export default function EmailRequestModal({
  opened,
  onClose,
  title,
  description,
  email,
  onEmailChange,
  onSubmit,
  loading,
}) {
  const { t } = useTranslation();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<div className="text-lg font-semibold">{title}</div>}
    >
      {description && <div className="mb-4">{description}</div>}
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <TextInput
          className="grow"
          type="email"
          label={t('Email or Username')}
          value={email}
          onChange={onEmailChange}
          required
        />
        <Button type="submit" loading={loading} disabled={loading} className="mt-3 self-end">
          {t('Submit')}
        </Button>
      </form>
    </Modal>
  );
}
