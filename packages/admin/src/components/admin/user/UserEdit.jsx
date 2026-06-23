import { useTranslation } from 'react-i18next';
import Card from '../../../common/ui/Card.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';
import Select from '../../../common/ui/Select.jsx';
import Divider from '../../../common/ui/Divider.jsx';
import H1 from '../../../common/ui/H1.jsx';
import H3 from '../../../common/ui/H3.jsx';
import RecordSelectMulti from '../../../common/ui/RecordSelectMulti.jsx';
import ReadOnlyField from '../../../common/ui/ReadOnlyField.jsx';
import Chip from '../../../common/ui/Chip.jsx';
import { Modal, Tabs, Combobox, Group, CheckIcon } from '@mantine/core';
import useModel from '../../../common/api/useModel.jsx';
import NotificationState from '../../../common/stores/NotificationState.js';
import { useNavigate, useParams } from 'react-router-dom';
import countries from '../../../constants/countries.js';
import { useState } from 'react';
import useAuthentication from '../../../common/api/useAuthentication.js';
import EditFormActionBar from '../../../common/ui/EditFormActionBar.jsx';
import FormViewSkeleton from '../../../common/ui/FormViewSkeleton.jsx';
import PasswordInput from '../../../common/ui/PasswordInput.jsx';
import Button from '../../../common/ui/Button.jsx';
import FileInput from '../../../common/ui/FileInput.jsx';
import VisibilityControl from '../../../common/auth/VisibilityControl.jsx';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import { useDisclosure } from '@mantine/hooks';
import Configure2FaModal from '../../../common/auth/Configure2FaModal.jsx';
import RecoveryCodesModal from '../../../common/auth/RecoveryCodesModal.jsx';
import useHash from '../../../common/api/useHash.js';
import { IconAddressBook, IconFingerprint, IconKey, IconShield } from '@tabler/icons-react';

export default function UserEdit() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user: currentUser, fetchUser } = useAuthentication();
  const { id } = useParams();
  const { hashParams, updateHash } = useHash();
  const tabFromHash = hashParams.get('tab');

  const query = useModel('user', {
    id,
    autoFetch: true,
  });
  const { record, setRecord, update, loading } = query;
  const { user } = useAuthentication();
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const { notify } = NotificationState((state) => state);
  const { backendHost } = BackendHostURLState((state) => state);
  const [isOpen2FaModal, { open: open2FaModal, close: close2FaModal }] = useDisclosure();
  const [
    isOpenRecoveryCodesModal,
    { open: openRecoveryCodesModal, close: closeRecoveryCodesModal },
  ] = useDisclosure();
  const [recoveryCodes, setRecoveryCodes] = useState([]);

  const canEditRolesAndOrgs =
    currentUser.roles.find((role) => ['admin_role', 'super_admin_role'].includes(role.string_id)) ||
    !['admin_user'].includes(record?.string_id);

  async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    const isValid = e.target.reportValidity();
    if (!isValid) {
      return;
    }
    if (newPassword !== confirmPassword) {
      notify({
        message: t('Password and confirm password does not match'),
        type: 'error',
      });
      return;
    }
    if (newPassword === oldPassword) {
      notify({
        message: t('The new password is equal to the old password'),
        type: 'warning',
      });
      return;
    }
    try {
      setChangePasswordLoading(true);
      const headers = {
        'Content-Type': 'application/json',
      };
      if (user?.token) {
        headers.Authorization = `Bearer ${user.token}`;
      }
      const response = await fetch(`${backendHost}/change-password`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
        }),
      });
      if (response.status !== 200) {
        const { detail } = await response.json();
        if (Array.isArray(detail) && detail.length) {
          notify({
            message: detail[0].msg,
            type: 'error',
          });
        } else if (typeof detail === 'string') {
          notify({
            message: detail,
            type: 'error',
          });
        }
      } else {
        notify({
          type: 'success',
          message: t('Password changed successfully!'),
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
      setChangePasswordLoading(false);
    }
  }

  function closeModal() {
    setChangePasswordModalOpen(false);
    clearForm();
  }

  function clearForm() {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  async function handleSubmit(e) {
    try {
      e.preventDefault();
      await update(record);

      // If the user is editing themselves, we need to update the user object
      if (currentUser.id === record.id) {
        await fetchUser();
      }
      notify({
        message: t('User updated successfully!'),
        type: 'success',
      });
      navigate(-1);
    } catch (error) {
      console.error(error);
      notify({
        message: error.message,
        type: 'error',
      });
    }
  }

  return (
    <form className={`max-w-screen-xl m-auto my-[20px] px-[24px]`} onSubmit={handleSubmit}>
      <EditFormActionBar loading={loading} />
      {record ? (
        <Card>
          <div className={`flex items-start justify-between gap-2`}>
            <div className={`flex items-center gap-2`}>
              <FileInput
                classNames={{ img: 'object-cover bg-gray-200 rounded-xl' }}
                value={record.image?.name}
                onChange={(file) => {
                  setRecord({
                    ...record,
                    image: file,
                    image_id: file?.id,
                  });
                }}
                type="image"
              />
              <H1>{record.email || record.username}</H1>
            </div>

            {currentUser.id === record.id && (
              <div className={`flex gap-2`}>
                <Button onClick={() => setChangePasswordModalOpen(true)}>
                  <IconKey size={18} className="mr-1" />
                  {t('Change Password')}
                </Button>
                <Button onClick={open2FaModal}>
                  <IconShield size={18} className="mr-1" />
                  {t('Configure 2FA')}
                </Button>
              </div>
            )}
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
                roleIds={['super_admin_role', 'admin_role', 'website_admin_role']}
                render={false}
              >
                <Tabs.Tab value="access" leftSection={<IconFingerprint size={16} />}>
                  {t('Access')}
                </Tabs.Tab>
              </VisibilityControl>
            </Tabs.List>

            <VisibilityControl
              roleIds={['super_admin_role', 'admin_role', 'website_admin_role']}
              render={false}
            >
              <Tabs.Panel value="access" className={`mt-4 flex flex-row gap-10`}>
                {canEditRolesAndOrgs ? (
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
                              value: [
                                'website_admin_role',
                                'website_editor_role',
                                'website_author_role',
                              ],
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
                          {currentValue?.find((r) => r.id === option.id) ? (
                            <CheckIcon size={12} />
                          ) : null}
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
                ) : (
                  <ReadOnlyField label={t(`Roles`)} className={`w-1/2 flex-wrap`}>
                    <div className={`flex gap-1 items-center flex-wrap`}>
                      {record.roles?.map((role) => (
                        <Chip size={`xs`} key={role.id} variant="outline" checked={false}>
                          {role.name}
                        </Chip>
                      ))}
                    </div>
                  </ReadOnlyField>
                )}
                {canEditRolesAndOrgs ? (
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
                ) : (
                  <ReadOnlyField label={t(`Organizations`)} className={`w-1/2 flex-wrap`}>
                    <div className={`flex gap-1 items-center flex-wrap`}>
                      {record.organizations?.map((organization) => (
                        <Chip size={`xs`} key={organization.id} variant="outline" checked={false}>
                          {organization.name}
                        </Chip>
                      ))}
                    </div>
                  </ReadOnlyField>
                )}
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

              {/*<div className={`flex gap-2 my-2 flex-wrap`}>*/}
              {/*  <FileInput*/}
              {/*    label={t('CV')}*/}
              {/*    value={record.cv?.name}*/}
              {/*    height={40}*/}
              {/*    width={40}*/}
              {/*    onChange={(file) => {*/}
              {/*      setRecord({*/}
              {/*        ...record,*/}
              {/*        cv: file,*/}
              {/*        cv_attachment_id: file?.id,*/}
              {/*      });*/}
              {/*    }}*/}
              {/*  />*/}
              {/*</div>*/}

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
        </Card>
      ) : (
        <FormViewSkeleton />
      )}

      <Modal
        opened={changePasswordModalOpen}
        onClose={closeModal}
        title={<div className={`font-bold`}>{t('Change Password')}</div>}
      >
        <form onSubmit={handleChangePasswordSubmit} className={`flex flex-col gap-2`}>
          <PasswordInput
            label={t(`Old password`)}
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
          />
          <PasswordInput
            label={t(`New password`)}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <PasswordInput
            label={t(`Confirm new password`)}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <Button
            type={`submit`}
            loading={changePasswordLoading}
            disabled={changePasswordLoading}
            className="mt-3"
          >
            {t('Submit')}
          </Button>
        </form>
      </Modal>

      <Configure2FaModal
        isOpen={isOpen2FaModal}
        close={close2FaModal}
        onConfirmUsed2Fa={(recoveryCodes) => {
          setRecoveryCodes(recoveryCodes);
          openRecoveryCodesModal();
        }}
      />
      <RecoveryCodesModal
        isOpen={isOpenRecoveryCodesModal}
        close={closeRecoveryCodesModal}
        recoveryCodes={recoveryCodes}
      />
    </form>
  );
}
