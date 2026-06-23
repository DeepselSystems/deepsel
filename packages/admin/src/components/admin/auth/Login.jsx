import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import NotificationState from '../../../common/stores/NotificationState.js';
import useAuthentication from '../../../common/api/useAuthentication.js';
import { useTranslation } from 'react-i18next';
import { Modal, Tabs } from '@mantine/core';
import TextInput from '../../../common/ui/TextInput.jsx';
import Button from '../../../common/ui/Button.jsx';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import { useDisclosure } from '@mantine/hooks';
import useFetch from '../../../common/api/useFetch.js';
import { useBasename } from '../../../common/BasenameContext.js';

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
  const { backendHost } = BackendHostURLState((state) => state);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState('');
  const { notify } = NotificationState((state) => state);
  const { login, signup, passwordlessLogin } = useAuthentication();
  const [loading, setLoading] = useState(false);

  // reset password feature
  const [isOpenModel, setIsOpenModel] = useState(false);
  const [email, setEmail] = useState('');
  const [isPasswordResetLoading, setIsPasswordResetLoading] = useState(false);
  const [isUseOtpField, setIsUseOtpField] = useState(false);
  const [isOpenResetPasswordModalToConfig2Fa, setIsOpenResetPasswordModalToConfig2Fa] =
    useState(false);
  const { organizationId } = OrganizationIdState((state) => state);
  const [orgPublicSettings, setOrgPublicSettings] = useState({});

  // passwordless login feature
  const [failCount, setFailCount] = useState(0);
  const [passwordlessModalOpen, { open: openPasswordlessModal, close: closePasswordlessModal }] =
    useDisclosure();
  const { post: requestPasswordlessLogin, loading: passwordlessLoading } = useFetch(
    'passwordless-login-request',
  );
  // const {passwordless: passwordlessToken} = useParams();
  const searchParams = useSearchParams()[0];
  const passwordlessToken = searchParams.get('passwordless');

  // on mount, if passwordlessToken is present, try to login
  useEffect(() => {
    if (allowPasswordlessLogin && passwordlessToken) {
      handlePasswordlessLogin();
    }
  }, []);

  useEffect(() => {
    fetchOrgPublicSettings();
  }, [organizationId]);

  async function fetchOrgPublicSettings() {
    const response = await fetch(`${backendHost}/util/public_settings/${organizationId}`);
    const data = await response.json();
    setOrgPublicSettings(data);
  }

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
        setIsOpenModel(true);
        setIsOpenResetPasswordModalToConfig2Fa(true);
        return;
      }

      notify({
        message: t('Logged in successfully!'),
        type: 'success',
      });
      const redirect = new URLSearchParams(location.search).get('redirect');
      let redirectPath = redirect || defaultRedirect;
      if (redirectPath.startsWith(basename + '/')) {
        redirectPath = redirectPath.substring(basename.length) || defaultRedirect;
      } else if (redirectPath === basename) {
        redirectPath = defaultRedirect;
      }
      navigate(redirectPath);
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
      const redirect = new URLSearchParams(location.search).get('redirect');
      let redirectPath = redirect || defaultRedirect;
      if (redirectPath.startsWith(basename + '/')) {
        redirectPath = redirectPath.substring(basename.length) || defaultRedirect;
      } else if (redirectPath === basename) {
        redirectPath = defaultRedirect;
      }
      navigate(redirectPath);
    } catch (err) {
      notify({
        message: err.message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  function closeModal() {
    setIsOpenModel(false);
    setEmail('');
  }

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
      const response = await fetch(`${backendHost}/reset-password-request`, {
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

  async function handlePasswordlessLogin() {
    try {
      setLoading(true);
      await passwordlessLogin(passwordlessToken);

      notify({
        message: t('Logged in successfully!'),
        type: 'success',
      });
      const redirect = new URLSearchParams(location.search).get('redirect');
      let redirectPath = redirect || defaultRedirect;
      if (redirectPath.startsWith(basename + '/')) {
        redirectPath = redirectPath.substring(basename.length) || defaultRedirect;
      } else if (redirectPath === basename) {
        redirectPath = defaultRedirect;
      }
      navigate(redirectPath);
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

  return (
    <main className={`max-w-screen-xl grow mx-auto pt-10 w-full`}>
      <Tabs defaultValue="login" variant="outline" className={`max-w-[400px] mx-auto`}>
        <Tabs.List justify="start">
          <Tabs.Tab value="login">{t('Login')}</Tabs.Tab>
          {allowSignup && orgPublicSettings?.allow_public_signup && (
            <Tabs.Tab value="signup">{t('Signup')}</Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Panel value="login">
          <form className={`flex flex-col gap-2 pt-2`} onSubmit={handleLogin}>
            <TextInput
              label={t(`Email or Username`)}
              type="text"
              required
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
            />
            <TextInput
              label={t(`Password`)}
              type="password"
              required
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />
            {isUseOtpField && (
              <TextInput
                autoComplete="one-time-code"
                name="otp"
                label={t(`OTP`)}
                type="text"
                value={loginOtp}
                onChange={(e) => setLoginOtp(e.target.value)}
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
                  (window.location.href = `${backendHost}/login/google?organization_id=${organizationId}`)
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
                  const redirect = new URLSearchParams(location.search).get('redirect');
                  const baseUrl = `${backendHost}/login/saml?organization_id=${organizationId}`;
                  const samlUrl = redirect
                    ? `${baseUrl}&redirect=${encodeURIComponent(redirect)}`
                    : baseUrl;
                  window.location.href = samlUrl;
                }}
              >
                <div className="flex items-center justify-center w-5 h-5 bg-blue-600 text-white rounded text-xs font-bold">
                  S
                </div>
                <div className="ml-4">{t('Login with SAML')}</div>
              </Button>
            )}
            {allowResetPassword && (
              <Button
                onClick={() => {
                  setIsOpenModel(true);
                  setIsOpenResetPasswordModalToConfig2Fa(false);
                }}
                variant="light"
              >
                {t('Reset password')}
              </Button>
            )}

            {allowPasswordlessLogin && failCount > 0 && orgPublicSettings?.is_smtp_configured && (
              <button
                className={`text-primary-main underline text-sm mt-2`}
                onClick={openPasswordlessModal}
              >
                {t('Having trouble? Login quickly with your email')}
              </button>
            )}
          </form>
        </Tabs.Panel>

        {allowSignup && orgPublicSettings?.allow_public_signup && (
          <Tabs.Panel value="signup">
            <form className={`flex flex-col gap-2 pt-2`} onSubmit={handleSignup}>
              <TextInput
                label={t(`Email`)}
                type="email"
                required
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
              />
              <TextInput
                label={t(`Password`)}
                type="password"
                required
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
              />
              <TextInput
                label={t('Confirm Password')}
                type="password"
                required
                value={signupPasswordConfirm}
                onChange={(e) => setSignupPasswordConfirm(e.target.value)}
              />
              <Button type="submit" loading={loading} disabled={loading}>
                {t('Signup')}
              </Button>
            </form>
          </Tabs.Panel>
        )}
      </Tabs>

      <Modal
        opened={isOpenModel}
        onClose={closeModal}
        title={
          <div className={`text-lg font-semibold`}>
            {isOpenResetPasswordModalToConfig2Fa
              ? t('Two-Factor-Authentication')
              : t('Reset Password')}
          </div>
        }
      >
        {isOpenResetPasswordModalToConfig2Fa && (
          <div className="mb-4">
            {t(
              'Your organization require Two-Factor-Authentication. Please enter your email to set up new login credentials',
            )}
          </div>
        )}
        <form onSubmit={handleResetPasswordSubmit} className={`flex items-center gap-2`}>
          <TextInput
            className="grow"
            type="email"
            label={t('Email or Username')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button
            type={`submit`}
            loading={isPasswordResetLoading}
            disabled={isPasswordResetLoading}
            className="mt-3 self-end"
          >
            {t('Submit')}
          </Button>
        </form>
      </Modal>

      <Modal
        opened={passwordlessModalOpen}
        onClose={closePasswordlessModal}
        title={<div className={`text-lg font-semibold`}>{t('Passwordless Login')}</div>}
      >
        <form onSubmit={handlePasswordlessRequest} className={`flex items-center gap-2`}>
          <TextInput
            className="grow"
            type="email"
            label={t('Email or Username')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button
            type={`submit`}
            loading={passwordlessLoading}
            disabled={passwordlessLoading}
            className="mt-3 self-end"
          >
            {t('Submit')}
          </Button>
        </form>
      </Modal>
    </main>
  );
}
