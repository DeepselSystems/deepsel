import { useTranslation } from 'react-i18next';

import TextInput from '../../../../common/ui/TextInput.jsx';
import Button from '../../../../common/ui/Button.jsx';

/** CSS classes shared by login form shells */
const FORM_SHELL_CLASS = 'flex flex-col gap-2 pt-2';

/**
 * Step 1 of the login flow: collects the username/email and fetches available organizations.
 * Social login (SAML) and passwordless options are surfaced in step 2, after the
 * org is resolved, so the org-specific settings are available.
 *
 * @param {string} email - Current value of the email/username input.
 * @param {function} onEmailChange - Called with the new input value.
 * @param {boolean} loading - When true, the Continue button shows a loading state.
 * @param {function} onSubmit - Form submit handler.
 */
export default function UsernameStepForm({ email, onEmailChange, loading, onSubmit }) {
  const { t } = useTranslation();

  return (
    <form className={FORM_SHELL_CLASS} onSubmit={onSubmit}>
      <TextInput
        label={t('Email or Username')}
        type="text"
        variant="filled"
        required
        value={email}
        onChange={onEmailChange}
      />
      <Button type="submit" loading={loading} disabled={loading}>
        {t('Continue')}
      </Button>
    </form>
  );
}
