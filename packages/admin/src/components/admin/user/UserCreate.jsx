import { useTranslation } from 'react-i18next';
import TextInput from '../../../common/ui/TextInput.jsx';
import H1 from '../../../common/ui/H1.jsx';
import { useState } from 'react';
import NotificationState from '../../../common/stores/NotificationState.js';
import { useNavigate } from 'react-router-dom';
import RecordSelectMulti from '../../../common/ui/RecordSelectMulti.jsx';
import useModel from '../../../common/api/useModel.jsx';
import FileInput from '../../../common/ui/FileInput.jsx';
import CreateFormWrapper from '../../../common/ui/CreateFormWrapper.jsx';
import { Tabs } from '@mantine/core';
import VisibilityControl from '../../../common/auth/VisibilityControl.jsx';
import Select from '../../../common/ui/Select.jsx';
import H3 from '../../../common/ui/H3.jsx';
import Divider from '../../../common/ui/Divider.jsx';
import countries from '../../../constants/countries.js';
import useHash from '../../../common/api/useHash.js';
import { Combobox, Group, CheckIcon } from '@mantine/core';
import useAuthentication from '../../../common/api/useAuthentication.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import OrganizationState from '../../../common/stores/OrganizationState.js';
import { IconAddressBook, IconFingerprint } from '@tabler/icons-react';

export default function UserCreate(props) {
  const { modalMode } = props;
  const { t } = useTranslation();
  const { user: currentUser } = useAuthentication();
  const { organizationId } = OrganizationIdState();
  const { organizations } = OrganizationState();
  const { hashParams, updateHash } = useHash();
  const tabFromHash = hashParams.get('tab');

  const [record, setRecord] = useState({
    string_id: '',
    username: '',
    email: '',
    signed_up: true,
    internal: true,
    image_id: null,
    cv_attachment_id: null,
    street: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    name: '',
    last_name: '',
    first_name: '',
    middle_name: '',
    title: '',
    phone: '',
    mobile: '',
    website: '',
    company_name: '',
    roles: [],
    organizations: organizationId ? organizations.filter((org) => org.id === organizationId) : [],
  });
  const [loading, setLoading] = useState(false);
  const { notify } = NotificationState((state) => state);
  const navigate = useNavigate();
  const { create: createUser } = useModel('user');

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setLoading(true);
      await createUser(record);
      notify({
        message: t('User created successfully!'),
        type: 'success',
      });
      navigate(-1);
    } catch (e) {
      console.error(e);
      notify({
        message: e.message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <CreateFormWrapper onSubmit={handleSubmit} modalMode={modalMode} loading={loading}>
      <div className={`flex items-start justify-between gap-2`}>
        <div className={`flex items-center gap-2`}>
          <FileInput
            value={record.image?.name}
            onChange={(file) =>
              setRecord({
                ...record,
                image: file,
                image_id: file?.id,
              })
            }
            type="image"
          />
          <H1>{record.email || record.username}</H1>
        </div>
      </div>

      <div className={`flex gap-2 my-2 flex-wrap`}>
        <TextInput
          className={`grow`}
          label={t('Username')}
          description={t('Optional unique identifier')}
          placeholder={t(`john.doe`)}
          value={record.username}
          onChange={(e) =>
            setRecord({
              ...record,
              username: e.target.value,
            })
          }
        />
        <TextInput
          className={`grow`}
          label={t('Email')}
          value={record.email}
          description={t('Unique primary email')}
          type={`email`}
          placeholder={t('me@example.com')}
          onChange={(e) =>
            setRecord({
              ...record,
              email: e.target.value,
            })
          }
          required
        />
      </div>

      <div className={`flex gap-2 my-2 flex-wrap`}>
        <TextInput
          label={t('Company name')}
          value={record.company_name}
          onChange={(e) =>
            setRecord({
              ...record,
              company_name: e.target.value,
            })
          }
        />
      </div>

      <Tabs
        variant="outline"
        defaultValue={tabFromHash || 'contact'}
        onChange={(value) => updateHash({ tab: value })}
        className="mt-4"
      >
        <Tabs.List>
          <Tabs.Tab value="contact" leftSection={<IconAddressBook size={16} />}>
            {t('Contact Info')}
          </Tabs.Tab>
          <VisibilityControl
            roleIds={[`super_admin_role`, `admin_role`, `website_admin_role`]}
            render={false}
          >
            <Tabs.Tab value="access" leftSection={<IconFingerprint size={16} />}>
              {t('Access')}
            </Tabs.Tab>
          </VisibilityControl>
        </Tabs.List>

        <VisibilityControl
          roleIds={[`super_admin_role`, `admin_role`, `website_admin_role`]}
          render={false}
        >
          <Tabs.Panel value="access" className={`mt-4`}>
            <RecordSelectMulti
              pageSize={null}
              label={t(`Roles`)}
              model={`role`}
              value={record.roles}
              onChange={(roles) => setRecord({ ...record, roles })}
              filters={
                currentUser.roles.find((role) =>
                  ['admin_role', 'super_admin_role'].includes(role.string_id),
                )
                  ? []
                  : [
                      {
                        field: 'string_id',
                        operator: 'in',
                        value: ['website_admin_role', 'website_editor_role', 'website_author_role'],
                      },
                    ]
              }
              renderOption={(option, currentValue) => (
                <Combobox.Option
                  value={option}
                  key={option.id}
                  active={currentValue?.find((r) => r.id === option.id)}
                >
                  <Group gap="sm">
                    {currentValue?.find((r) => r.id === option.id) ? <CheckIcon size={12} /> : null}
                    <div className="py-1">
                      <div className="font-semibold text-gray-900">{option.name}</div>
                      {option.description && (
                        <div className="text-sm text-gray-500">{option.description}</div>
                      )}
                    </div>
                  </Group>
                </Combobox.Option>
              )}
            />
            <RecordSelectMulti
              pageSize={null}
              label={t(`Organizations`)}
              model={`organization`}
              value={record.organizations}
              onChange={(organizations) => setRecord({ ...record, organizations })}
              filters={
                currentUser.roles.find((role) =>
                  ['admin_role', 'super_admin_role'].includes(role.string_id),
                )
                  ? []
                  : currentUser.organizations.length === 0
                    ? []
                    : [
                        {
                          field: 'id',
                          operator: 'in',
                          value: currentUser.organizations.map((org) => org.id),
                        },
                      ]
              }
            />
          </Tabs.Panel>
        </VisibilityControl>

        <Tabs.Panel value="contact">
          <div className={`flex gap-2 my-2 flex-wrap`}>
            <Select
              label={t('Title')}
              classNames={{
                root: 'max-w-[80px]',
              }}
              data={['Mr', 'Mrs', 'Ms', 'Dr', 'Prof']}
              searchable
              value={record.title}
              onChange={(value) =>
                setRecord({
                  ...record,
                  title: value,
                })
              }
            />
            <TextInput
              label={t('Display name')}
              value={record.name}
              onChange={(e) =>
                setRecord({
                  ...record,
                  name: e.target.value,
                })
              }
            />
            <TextInput
              label={t('First name')}
              value={record.first_name}
              onChange={(e) =>
                setRecord({
                  ...record,
                  first_name: e.target.value,
                })
              }
            />
            <TextInput
              label={t('Last name')}
              value={record.last_name}
              onChange={(e) =>
                setRecord({
                  ...record,
                  last_name: e.target.value,
                })
              }
            />
          </div>

          <div className={`flex gap-2 my-2 flex-wrap`}>
            <TextInput
              label={t('Website')}
              value={record.website}
              onChange={(e) =>
                setRecord({
                  ...record,
                  website: e.target.value,
                })
              }
            />
          </div>

          <div className={`flex gap-2 my-2 flex-wrap`}>
            <TextInput
              label={t('Phone')}
              value={record.phone}
              onChange={(e) =>
                setRecord({
                  ...record,
                  phone: e.target.value,
                })
              }
            />
            <TextInput
              label={t('Mobile')}
              value={record.mobile}
              onChange={(e) =>
                setRecord({
                  ...record,
                  mobile: e.target.value,
                })
              }
            />
          </div>

          <H3 className={`mt-4`}>{t('Address')}</H3>
          <Divider />

          <div className={`flex gap-2 my-2 flex-wrap`}>
            <TextInput
              label={t('Street address')}
              value={record.street}
              onChange={(e) =>
                setRecord({
                  ...record,
                  street: e.target.value,
                })
              }
            />
            <TextInput
              label={t('Street address line 2')}
              value={record.street2}
              onChange={(e) =>
                setRecord({
                  ...record,
                  street2: e.target.value,
                })
              }
            />
          </div>

          <div className={`flex gap-2 my-2 flex-wrap`}>
            <TextInput
              label={t('City')}
              value={record.city}
              onChange={(e) =>
                setRecord({
                  ...record,
                  city: e.target.value,
                })
              }
            />
            <TextInput
              label={t('State')}
              value={record.state}
              onChange={(e) =>
                setRecord({
                  ...record,
                  state: e.target.value,
                })
              }
            />
          </div>

          <div className={`flex gap-2 my-2 flex-wrap`}>
            <TextInput
              label={t('Zip code')}
              value={record.zip}
              classNames={{
                root: 'max-w-[100px]',
              }}
              onChange={(e) =>
                setRecord({
                  ...record,
                  zip: e.target.value,
                })
              }
            />
            <Select
              label={t('Country')}
              placeholder={t('Pick a country')}
              data={countries.map((country) => country.label)}
              searchable
              value={record.country}
              onChange={(value) =>
                setRecord({
                  ...record,
                  country: value,
                })
              }
            />
          </div>
        </Tabs.Panel>
      </Tabs>
    </CreateFormWrapper>
  );
}
