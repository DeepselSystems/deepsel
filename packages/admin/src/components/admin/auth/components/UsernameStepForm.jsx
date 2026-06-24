import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

import TextInput from '../../../../common/ui/TextInput.jsx';
import Button from '../../../../common/ui/Button.jsx';

/** CSS classes shared by login form shells */
const FORM_SHELL_CLASS = 'flex flex-col gap-2 pt-2';

/**
 * Step 1 of the login flow: collects the username/email and fetches available organizations.
 * Also surfaces Google Sign-In and SAML buttons when enabled in org public settings,
 * so users who prefer social login do not need to go through the username step first.
 *
 * @param {string} email - Current value of the email/username input.
 * @param {function} onEmailChange - Called with the new input value.
 * @param {boolean} loading - When true, the Continue button shows a loading state.
 * @param {function} onSubmit - Form submit handler.
 * @param {object} orgPublicSettings - Public settings for the org (may be domain-resolved when no org is selected).
 * @param {number|null} organizationId - Currently selected org ID (may be null on first visit).
 * @param {string} locationSearch - Value of `location.search` for redirect handling.
 */
export default function UsernameStepForm({
  email,
  onEmailChange,
  loading,
  onSubmit,
  orgPublicSettings,
  organizationId,
  locationSearch,
}) {
  const { t } = useTranslation();

  return (
    <form className={FORM_SHELL_CLASS} onSubmit={onSubmit}>
      <TextInput
        label={t('Email or Username')}
        type="text"
        required
        value={email}
        onChange={onEmailChange}
      />
      <Button type="submit" loading={loading} disabled={loading}>
        {t('Continue')}
      </Button>
      {orgPublicSettings?.is_enabled_google_sign_in && (
        <Button
          className="flex items-center"
          variant="light"
          onClick={() =>
            (window.location.href = organizationId
              ? `/api/v1/login/google?organization_id=${organizationId}`
              : `/api/v1/login/google`)
          }
        >
          <img src="/images/google-logo.svg" alt="" className="w-5 h-5 object-contain" />
          <div className="ml-4">{t('Login with Google')}</div>
        </Button>
      )}
      {orgPublicSettings?.is_enabled_saml && (
        <Button
          className={clsx('flex items-center')}
          variant="light"
          onClick={() => {
            const redirect = new URLSearchParams(locationSearch).get('redirect');
            const baseUrl = organizationId
              ? `/api/v1/login/saml?organization_id=${organizationId}`
              : `/api/v1/login/saml`;
            window.location.href = redirect
              ? `${baseUrl}${organizationId ? '&' : '?'}redirect=${encodeURIComponent(redirect)}`
              : baseUrl;
          }}
        >
          <div className="flex items-center justify-center w-5 h-5 bg-blue-600 text-white rounded text-xs font-bold">
            S
          </div>
          <div className="ml-4">{t('Login with SAML')}</div>
        </Button>
      )}
    </form>
  );
}
