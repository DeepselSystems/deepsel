import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import NotificationState from '../../../common/stores/NotificationState.js';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import H1 from '../../../common/ui/H1.jsx';

export default function ResetPasswordConfirmation() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { token } = useParams();
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const { backendHost } = BackendHostURLState((state) => state);
  const { notify } = NotificationState((state) => state);

  async function handleSubmit(e) {
    setLoading(true);
    e.preventDefault();
    try {
      const res = await fetch(`${backendHost}/reset-password-confirmation`, {
        method: 'POST',
        body: JSON.stringify({
          token,
          newPassword,
        }),
      });
      if (res.status === 200) {
        notify({
          message: t('Password reset successful! Please login'),
          type: 'success',
        });
        navigate('/login');
      } else {
        notify({
          message: t('An error occurred'),
          type: 'error',
        });
      }
    } catch (e) {
      notify({
        message: t('An error occurred'),
        type: 'error',
      });
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <form className={`border border-black p-2 m-2`} onSubmit={handleSubmit}>
        <H1 className="text-3xl font-bold">{t('Reset Password')}</H1>
        <label htmlFor="new-password">{t('Password')}</label>
        <input
          id="new-password"
          type="password"
          required
          className={`border border-black p-1 m-1`}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <label htmlFor="new-password-confirm">{t('Confirm Password')}</label>
        <input
          id="new-password-confirm"
          type="password"
          required
          className={`border border-black p-1 m-1`}
          value={newPasswordConfirm}
          onChange={(e) => setNewPasswordConfirm(e.target.value)}
        />
        <button
          className={`border border-black bg-gray-200 p-1 `}
          type="submit"
          disabled={loading || newPassword !== newPasswordConfirm}
        >
          {loading ? 'Loading...' : 'Reset Password'}
        </button>
      </form>
    </main>
  );
}
