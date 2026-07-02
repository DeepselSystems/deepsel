import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import NotificationState from '../../../common/stores/NotificationState.js';
import useAuthentication from '../../../common/api/useAuthentication.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import useFetch from '../../../common/api/useFetch.js';
import { useBasename } from '../../../common/BasenameContext.js';
import UsernameStepForm from './components/UsernameStepForm.jsx';
import PasswordStepForm from './components/PasswordStepForm.jsx';
import SignupForm from './components/SignupForm.jsx';
import EmailRequestModal from './components/EmailRequestModal.jsx';
import { useEffectOnce } from '../../../common/lib/hooks/index.js';

/**
 * Step identifiers for the two-step login flow.
 * Step 1: enter username. Step 2: select org + enter password.
 */
const LOGIN_STEP = {
  USERNAME: 'username',
  PASSWORD: 'password',
};

/** Number of splash images available under public/splash (splash-1.jpg … splash-N.jpg). */
const SPLASH_COUNT = 6;

/**
 * Two-step login flow component with org selector.
 * Step 1: enter username → fetch orgs → select org.
 * Step 2: enter password → authenticate.
 *
 * @param {string} [defaultRedirect='/pages'] - Path to redirect after successful login.
 * @param {boolean} [allowSignup=true] - Show the signup tab when org allows public signup.
 * @param {boolean} [allowResetPassword=true] - Show the reset password button.
 * @param {boolean} [allowPasswordlessLogin=true] - Show the passwordless login option.
 */
export default function Login({
  defaultRedirect = '/pages',
  allowSignup = true,
  allowResetPassword = true,
  allowPasswordlessLogin = true,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const basename = useBasename();
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState('');
  const { notify } = NotificationState((state) => state);
  const { login, signup, passwordlessLogin, fetchLoginOrganizations } = useAuthentication();
  const [loading, setLoading] = useState(false);

  // 2-step login state
  const [loginStep, setLoginStep] = useState(LOGIN_STEP.USERNAME);
  const [loginOrganizations, setLoginOrganizations] = useState([]);
  const [orgsFetching, setOrgsFetching] = useState(false);

  // reset password feature
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [email, setEmail] = useState('');
  const [isPasswordResetLoading, setIsPasswordResetLoading] = useState(false);
  const [isUseOtpField, setIsUseOtpField] = useState(false);
  const [isOpenResetPasswordModalToConfig2Fa, setIsOpenResetPasswordModalToConfig2Fa] =
    useState(false);
  const { organizationId, setOrganizationId } = OrganizationIdState((state) => state);
  const [orgPublicSettings, setOrgPublicSettings] = useState({});

  // passwordless login feature
  const [failCount, setFailCount] = useState(0);
  const [passwordlessModalOpen, { open: openPasswordlessModal, close: closePasswordlessModal }] =
    useDisclosure();
  const { post: requestPasswordlessLogin, loading: passwordlessLoading } = useFetch(
    'passwordless-login-request',
  );
  const searchParams = useSearchParams()[0];
  const passwordlessToken = searchParams.get('passwordless');
  // Enabled SSO providers for the org, shown as "or login using" buttons.
  const [oidcProviders, setOidcProviders] = useState([]);

  // Pick a random splash image once per mount for the split-screen panel.
  const [splashIndex] = useState(() => Math.floor(Math.random() * SPLASH_COUNT) + 1);

  /**
   * Fetches public org settings.
   * When an org is selected, uses the org-specific endpoint.
   * When no org is selected (e.g. incognito/first visit), falls back to the
   * domain-based endpoint so SAML buttons are visible before org selection.
   */
  const fetchOrgPublicSettings = useCallback(async () => {
    const url = organizationId
      ? `/api/v1/util/public_settings/${organizationId}`
      : `/api/v1/util/public_settings`;
    const response = await fetch(url);
    const data = await response.json();
    setOrgPublicSettings(data);
  }, [organizationId]);

  /**
   * Resolves the correct redirect path after a successful login,
   * stripping the basename prefix when present.
   */
  function resolveRedirectPath() {
    const redirect = new URLSearchParams(location.search).get('redirect');
    let redirectPath = redirect || defaultRedirect;
    if (redirectPath.startsWith(basename + '/')) {
      redirectPath = redirectPath.substring(basename.length) || defaultRedirect;
    } else if (redirectPath === basename) {
      redirectPath = defaultRedirect;
    }
    return redirectPath;
  }

  /**
   * Step 1 submit: fetches organizations for the entered username and
   * advances to the password step. Proceeds even if no orgs are returned
   * (unknown user) to avoid username enumeration.
   */
  async function handleUsernameSubmit(e) {
    e.preventDefault();
    try {
      setOrgsFetching(true);
      const result = await fetchLoginOrganizations(loginEmail);
      const orgs = result?.organizations ?? [];
      setLoginOrganizations(orgs);

      // Pre-select last used org if available and in the returned list, else first org
      if (orgs.length > 0) {
        const lastUsedId = result?.last_used_organization_id;
        const lastUsedInList = lastUsedId && orgs.find((o) => o.id === lastUsedId);
        const selectedId = lastUsedInList ? lastUsedId : orgs[0].id;
        setOrganizationId(selectedId);
      }

      setLoginStep(LOGIN_STEP.PASSWORD);
    } catch {
      // Proceed to password step regardless — do not reveal whether user exists
      setLoginStep(LOGIN_STEP.PASSWORD);
    } finally {
      setOrgsFetching(false);
    }
  }

  /**
   * Returns to step 1 (username) and resets the password field.
   */
  function handleBackToUsername() {
    setLoginStep(LOGIN_STEP.USERNAME);
    setLoginPassword('');
    setLoginOtp('');
    setIsUseOtpField(false);
    setLoginOrganizations([]);
  }

  /** Submits credentials and navigates on success, or prompts for OTP/2FA on demand */
  async function handleLogin(e) {
    try {
      e.preventDefault();
      setLoading(true);
      const result = await login({
        identifier: loginEmail,
        password: loginPassword,
        otp: loginOtp,
      });

      if (result?.is_require_user_config_2fa) {
        setIsOpenModal(true);
        setIsOpenResetPasswordModalToConfig2Fa(true);
        return;
      }

      notify({
        message: t('Logged in successfully!'),
        type: 'success',
      });
      navigate(resolveRedirectPath());
    } catch (err) {
      if (err?.message === 'Incorrect OTP' && !isUseOtpField) {
        notify({
          message: t('Please input OTP'),
          type: 'info',
        });
        setIsUseOtpField(true);
      } else {
        setFailCount(failCount + 1);
        notify({
          message: err.message,
          type: 'error',
        });
      }
    } finally {
      setLoading(false);
    }
  }

  /** Submits signup credentials and navigates on success */
  async function handleSignup(e) {
    try {
      e.preventDefault();
      setLoading(true);
      await signup(
        {
          email: signupEmail,
          password: signupPassword,
        },
        true,
      );
      notify({
        message: t('Signed up successfully!'),
        type: 'success',
      });
      navigate(resolveRedirectPath());
    } catch (err) {
      notify({
        message: err.message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  /** Closes the reset-password / 2FA modal and clears the email field */
  function closeModal() {
    setIsOpenModal(false);
    setEmail('');
  }

  /** Submits the password-reset or 2FA setup request */
  async function handleResetPasswordSubmit(e) {
    e.preventDefault();
    const isValid = e.target.reportValidity();
    if (!isValid) {
      return;
    }
    try {
      setIsPasswordResetLoading(true);
      const headers = {
        'Content-Type': 'application/json',
      };
      const response = await fetch(`api/v1/reset-password-request`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mixin_id: email,
          organization_id: organizationId,
        }),
      });
      if (response.status !== 200) {
        const { detail } = await response.json();
        if (typeof detail === 'string') {
          notify({
            message: detail,
            type: 'error',
          });
        }
      } else {
        notify({
          type: 'success',
          message: t('Password reset email sent!'),
        });
        closeModal();
      }
    } catch (err) {
      console.error(err);
      notify({
        message: t('An error occurred'),
        type: 'error',
      });
    } finally {
      setIsPasswordResetLoading(false);
    }
  }

  /** Requests a passwordless login link to be sent to the provided email */
  async function handlePasswordlessRequest(e) {
    e.preventDefault();
    try {
      await requestPasswordlessLogin({ mixin_id: email });
      notify({
        type: 'success',
        message: t('You login link is on the way!'),
      });
    } catch (err) {
      console.error(err);
      notify({
        message: t('An error occurred'),
        type: 'error',
      });
    }
  }

  /** Consumes the passwordless token from the URL query param to authenticate */
  async function handlePasswordlessLogin() {
    try {
      setLoading(true);
      await passwordlessLogin(passwordlessToken);

      notify({
        message: t('Logged in successfully!'),
        type: 'success',
      });
      navigate(resolveRedirectPath());
    } catch (err) {
      console.error(err);
      notify({
        message: t('Your login link is invalid'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  // on mount, if passwordlessToken is present, try to login
  useEffectOnce(() => {
    if (allowPasswordlessLogin && passwordlessToken) {
      void handlePasswordlessLogin();
    }
  });

  /**
   * Fetches public org settings for the currently selected organization
   */
  useEffect(() => {
    void fetchOrgPublicSettings();
  }, [fetchOrgPublicSettings]);

  /**
   * When the org has SSO enabled, fetch its enabled providers so the password
   * step can render an "or login using" button per provider. The login form is
   * always shown — the user picks a provider explicitly rather than being
   * auto-redirected to an arbitrary one.
   */
  useEffect(() => {
    if (!orgPublicSettings?.is_enabled_oidc || orgPublicSettings?.id == null) {
      setOidcProviders([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/v1/login/oidc/providers?organization_id=${orgPublicSettings.id}`,
        );
        const data = await response.json();
        if (!cancelled) setOidcProviders(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setOidcProviders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgPublicSettings]);

  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-cover bg-center p-4 md:p-8"
      style={{
        backgroundImage: `url(${import.meta.env.BASE_URL}splash/splash-${splashIndex}.jpg)`,
      }}
    >
      <h1 className="text-center text-4xl font-bold text-white drop-shadow-lg">
        {t('Welcome Back')}
      </h1>

      {/* Login form container, centered over the full-page splash background */}
      <main className="flex w-full max-w-[460px] items-center justify-center rounded-3xl bg-white px-6 py-10 shadow-xl">
        <div className="w-full max-w-[400px]">
            {loginStep === LOGIN_STEP.USERNAME ? (
              /* Step 1: show Login tab header so UI looks consistent with step 2 */
              <Tabs defaultValue="login" variant="outline">
                <Tabs.List justify="start">
                  <Tabs.Tab value="login">{t('Login')}</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="login">
                  <UsernameStepForm
                    email={loginEmail}
                    onEmailChange={(e) => setLoginEmail(e.target.value)}
                    loading={orgsFetching}
                    onSubmit={handleUsernameSubmit}
                  />
                </Tabs.Panel>
              </Tabs>
            ) : (
              /* Step 2: org selector + password, with optional signup tab */
              <Tabs defaultValue="login" variant="outline">
                <Tabs.List justify="start">
                  <Tabs.Tab value="login">{t('Login')}</Tabs.Tab>
                  {allowSignup && orgPublicSettings?.allow_public_signup && (
                    <Tabs.Tab value="signup">{t('Signup')}</Tabs.Tab>
                  )}
                </Tabs.List>

                <Tabs.Panel value="login">
                  <PasswordStepForm
                    loginEmail={loginEmail}
                    loginPassword={loginPassword}
                    onPasswordChange={(e) => setLoginPassword(e.target.value)}
                    loginOtp={loginOtp}
                    onOtpChange={(e) => setLoginOtp(e.target.value)}
                    isUseOtpField={isUseOtpField}
                    loading={loading}
                    onSubmit={handleLogin}
                    onBack={handleBackToUsername}
                    organizations={loginOrganizations}
                    organizationId={organizationId}
                    setOrganizationId={setOrganizationId}
                    orgPublicSettings={orgPublicSettings}
                    oidcProviders={oidcProviders}
                    locationSearch={location.search}
                    allowResetPassword={allowResetPassword}
                    allowPasswordlessLogin={allowPasswordlessLogin}
                    failCount={failCount}
                    onOpenResetModal={() => {
                      setIsOpenModal(true);
                      setIsOpenResetPasswordModalToConfig2Fa(false);
                    }}
                    onOpenPasswordlessModal={openPasswordlessModal}
                  />
                </Tabs.Panel>

                {allowSignup && orgPublicSettings?.allow_public_signup && (
                  <Tabs.Panel value="signup">
                    <SignupForm
                      email={signupEmail}
                      onEmailChange={(e) => setSignupEmail(e.target.value)}
                      password={signupPassword}
                      onPasswordChange={(e) => setSignupPassword(e.target.value)}
                      passwordConfirm={signupPasswordConfirm}
                      onPasswordConfirmChange={(e) => setSignupPasswordConfirm(e.target.value)}
                      loading={loading}
                      onSubmit={handleSignup}
                    />
                  </Tabs.Panel>
                )}
              </Tabs>
            )}
        </div>
      </main>

      <EmailRequestModal
        opened={isOpenModal}
        onClose={closeModal}
        title={
          isOpenResetPasswordModalToConfig2Fa ? t('Two-Factor-Authentication') : t('Reset Password')
        }
        description={
          isOpenResetPasswordModalToConfig2Fa
            ? t(
                'Your organization require Two-Factor-Authentication. Please enter your email to set up new login credentials',
              )
            : undefined
        }
        email={email}
        onEmailChange={(e) => setEmail(e.target.value)}
        onSubmit={handleResetPasswordSubmit}
        loading={isPasswordResetLoading}
      />

      <EmailRequestModal
        opened={passwordlessModalOpen}
        onClose={closePasswordlessModal}
        title={t('Passwordless Login')}
        email={email}
        onEmailChange={(e) => setEmail(e.target.value)}
        onSubmit={handlePasswordlessRequest}
        loading={passwordlessLoading}
      />
    </div>
  );
}
