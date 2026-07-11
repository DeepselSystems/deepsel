import { useTranslation } from 'react-i18next';

import TextInput from '../../../../common/ui/TextInput.jsx';
import Button from '../../../../common/ui/Button.jsx';

/** CSS classes shared by login form shells */
const FORM_SHELL_CLASS = 'flex flex-col gap-2 pt-2';

/**
 * Signup form for new user registration.
 *
 * @param {string} email - Current email input value.
 * @param {function} onEmailChange - Called with the change event for the email input.
 * @param {string} password - Current password input value.
 * @param {function} onPasswordChange - Called with the change event for the password input.
 * @param {string} passwordConfirm - Current confirm-password input value.
 * @param {function} onPasswordConfirmChange - Called with the change event for the confirm-password input.
 * @param {boolean} loading - When true, the Signup button shows a loading state.
 * @param {function} onSubmit - Form submit handler.
 */
export default function SignupForm({
  email,
  onEmailChange,
  password,
  onPasswordChange,
  passwordConfirm,
  onPasswordConfirmChange,
  loading,
  onSubmit,
}) {
  const { t } = useTranslation();

  return (
    <form className={FORM_SHELL_CLASS} onSubmit={onSubmit}>
      <TextInput
        label={t('Email')}
        type="email"
        variant="filled"
        required
        value={email}
        onChange={onEmailChange}
      />
      <TextInput
        label={t('Password')}
        type="password"
        variant="filled"
        required
        value={password}
        onChange={onPasswordChange}
      />
      <TextInput
        label={t('Confirm Password')}
        type="password"
        variant="filled"
        required
        value={passwordConfirm}
        onChange={onPasswordConfirmChange}
      />
      <Button type="submit" loading={loading} disabled={loading}>
        {t('Signup')}
      </Button>
    </form>
  );
}
