import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import clsx from 'clsx';

import TextInput from '../../../../common/ui/TextInput.jsx';
import Button from '../../../../common/ui/Button.jsx';
import OrgSelector from './OrgSelector.jsx';
import { ProviderIcon } from '../../oidc_provider/providerIcons.jsx';

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
 * @param {Array} oidcProviders - Enabled SSO providers [{id, display_name, adapter_name, icon}] for the chooser.
 * @param {string} locationSearch - value of `location.search` for redirect handling.
 * @param {boolean} allowResetPassword - Whether to show the reset password link.
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
  oidcProviders = [],
  locationSearch,
  allowResetPassword,
  allowPasswordlessLogin,
  failCount,
  onOpenResetModal,
  onOpenPasswordlessModal,
}) {
  const { t } = useTranslation();

  const hasSaml = !!orgPublicSettings?.is_enabled_saml;
  const hasSso = hasSaml || oidcProviders.length > 0;

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
        variant="filled"
        required
        autoFocus
        value={loginPassword}
        onChange={onPasswordChange}
      />

      {allowResetPassword && (
        <button
          type="button"
          className="-mt-1 self-end text-[12.5px] text-[#6b7385] hover:text-[#0f1420] hover:underline"
          onClick={onOpenResetModal}
        >
          {t('Forgot password?')}
        </button>
      )}

      {isUseOtpField && (
        <TextInput
          autoComplete="one-time-code"
          name="otp"
          label={t('OTP')}
          type="text"
          variant="filled"
          value={loginOtp}
          onChange={onOtpChange}
        />
      )}

      <Button type="submit" loading={loading} disabled={loading}>
        {t('Login')}
      </Button>

      {allowPasswordlessLogin && failCount > 0 && orgPublicSettings?.is_smtp_configured && (
        <button
          type="button"
          className="text-primary-main underline text-sm mt-2"
          onClick={onOpenPasswordlessModal}
        >
          {t('Having trouble? Login quickly with your email')}
        </button>
      )}

      {hasSso && (
        <>
          <div className="flex items-center gap-3 py-1 text-xs text-gray-400">
            <span className="h-px grow bg-gray-200" />
            {t('or login using')}
            <span className="h-px grow bg-gray-200" />
          </div>

          {hasSaml && (
            <Button
              className="flex items-center"
              variant="default"
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

          {oidcProviders.map((provider) => (
            <Button
              key={provider.id}
              className="flex items-center"
              variant="default"
              onClick={() => {
                const redirect = new URLSearchParams(locationSearch).get('redirect');
                const params = new URLSearchParams();
                if (organizationId) params.set('organization_id', organizationId);
                params.set('provider_id', provider.id);
                if (redirect) params.set('redirect', redirect);
                window.location.href = `/api/v1/login/oidc?${params.toString()}`;
              }}
            >
              <span className="flex items-center justify-center w-5 h-5 shrink-0">
                <ProviderIcon icon={provider.icon} size={20} />
              </span>
              <div className="ml-4">
                {t('Sign in with {{name}}', {
                  name: provider.display_name || provider.adapter_name,
                })}
              </div>
            </Button>
          ))}
        </>
      )}
    </form>
  );
}
