import { useTranslation } from 'react-i18next';
import { IconLock } from '@tabler/icons-react';
import H2 from '../../../../common/ui/H2.jsx';
import Switch from '../../../../common/ui/Switch.jsx';
import NumberInput from '../../../../common/ui/NumberInput.jsx';
import SiteSettingsSection from './SiteSettingsSection.jsx';

/**
 * General authentication settings for the selected organization —
 * enable auth, token expiry, 2FA, and public signup.
 */
export default function SiteSettingsAuthGeneral() {
  const { t } = useTranslation();

  return (
    <SiteSettingsSection
      onSubmit={async ({ record, update, setRecord }) => {
        const updatedRecord = await update(record);
        setRecord(updatedRecord);
      }}
    >
      {({ record, setRecord }) => (
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <IconLock size={16} className="text-gray-600" />
              <H2>{t('Authentication')}</H2>
            </div>

            <NumberInput
              label={t('Access Token Expiry Time (minutes)')}
              description={t('How long an access token stays valid before expiring.')}
              placeholder={t('Access Token Expiry Time (minutes)')}
              value={record.access_token_expire_minutes}
              onChange={(value) =>
                setRecord({
                  ...record,
                  access_token_expire_minutes: value,
                })
              }
              className="mb-2 max-w-[300px]"
            />

            <Switch
              label={t('Require Two-Factor-Authentication for all users')}
              className="mb-2 cursor-pointer"
              checked={record.require_2fa_all_users}
              onChange={(e) =>
                setRecord({
                  ...record,
                  require_2fa_all_users: e.currentTarget.checked,
                })
              }
            />

            <Switch
              label={t('Allow public signup')}
              className="mb-2 cursor-pointer"
              checked={record.allow_public_signup}
              onChange={(e) =>
                setRecord({
                  ...record,
                  allow_public_signup: e.currentTarget.checked,
                })
              }
            />
          </div>
        </div>
      )}
    </SiteSettingsSection>
  );
}
