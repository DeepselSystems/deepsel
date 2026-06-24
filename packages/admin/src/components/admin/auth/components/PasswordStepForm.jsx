import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import clsx from 'clsx';

import TextInput from '../../../../common/ui/TextInput.jsx';
import Button from '../../../../common/ui/Button.jsx';
import OrgSelector from './OrgSelector.jsx';

/** CSS classes shared by login form shells */
const FORM_SHELL_CLASS = 'flex flex-col gap-2 pt-2';

/**
 * Step 2 of the login flow: org selector + password entry + social login options.
 *
 * @param {string} loginEmail - The username entered in step 1, shown in the back button.
 * @param {string} loginPassword - Current password input value.
 * @param {function} onPasswordChange - Called with the change event for the password input.
 * @param {string} loginOtp - Current OTP input value.
 * @param {function} onOtpChange - Called with the change event for the OTP input.
 * @param {boolean} isUseOtpField - Whether to show the OTP field.
 * @param {boolean} loading - When true, the Login button shows a loading state.
 * @param {function} onSubmit - Form submit handler.
 * @param {function} onBack - Called when the user clicks the back-to-username button.
 * @param {Array} organizations - List of {id, name} org objects for OrgSelector.
 * @param {number|null} organizationId - Currently selected org ID.
 * @param {function} setOrganizationId - Setter for the selected org ID.
 * @param {object} orgPublicSettings - Public settings for the selected org.
 * @param {string} locationSearch - value of `location.search` for redirect handling.
 * @param {boolean} allowResetPassword - Whether to show the reset password button.
 * @param {boolean} allowPasswordlessLogin - Whether to show the passwordless login link.
 * @param {number} failCount - Number of failed login attempts.
 * @param {function} onOpenResetModal - Opens the reset password modal.
 * @param {function} onOpenPasswordlessModal - Opens the passwordless login modal.
 */
export default function PasswordStepForm({
  loginEmail,
  loginPassword,
  onPasswordChange,
  loginOtp,
  onOtpChange,
  isUseOtpField,
  loading,
  onSubmit,
  onBack,
  organizations,
  organizationId,
  setOrganizationId,
  orgPublicSettings,
  locationSearch,
  allowResetPassword,
  allowPasswordlessLogin,
  failCount,
  onOpenResetModal,
  onOpenPasswordlessModal,
}) {
  const { t } = useTranslation();

  return (
    <form className={FORM_SHELL_CLASS} onSubmit={onSubmit}>
      {/* Back button to step 1 */}
      <button
        type="button"
        className={clsx(
          'flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700',
          'self-start mb-1',
        )}
        onClick={onBack}
      >
        <FontAwesomeIcon icon={faArrowLeft} size="xs" />
        <span>{loginEmail}</span>
      </button>

      <OrgSelector
        organizations={organizations}
        organizationId={organizationId}
        onChange={setOrganizationId}
      />

      <TextInput
        label={t('Password')}
        type="password"
        required
        autoFocus
        value={loginPassword}
        onChange={onPasswordChange}
      />
      {isUseOtpField && (
        <TextInput
          autoComplete="one-time-code"
          name="otp"
          label={t('OTP')}
          type="text"
          value={loginOtp}
          onChange={onOtpChange}
        />
      )}

      <Button type="submit" loading={loading} disabled={loading}>
        {t('Login')}
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
          className="flex items-center"
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
      {allowResetPassword && (
        <Button onClick={onOpenResetModal} variant="light">
          {t('Reset password')}
        </Button>
      )}

      {allowPasswordlessLogin && failCount > 0 && orgPublicSettings?.is_smtp_configured && (
        <button
          className="text-primary-main underline text-sm mt-2"
          onClick={onOpenPasswordlessModal}
        >
          {t('Having trouble? Login quickly with your email')}
        </button>
      )}
    </form>
  );
}
