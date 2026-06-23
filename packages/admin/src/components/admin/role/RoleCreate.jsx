import { useTranslation } from 'react-i18next';
import Card from '../../../common/ui/Card.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';
import H1 from '../../../common/ui/H1.jsx';
import { useState } from 'react';
import useModel from '../../../common/api/useModel.jsx';
import NotificationState from '../../../common/stores/NotificationState.js';
import { JsonInput } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import CreateFormActionBar from '../../../common/ui/CreateFormActionBar.jsx';
import RecordSelectMulti from '../../../common/ui/RecordSelectMulti.jsx';
import TextArea from '../../../common/ui/TextArea.jsx';

export default function RoleCreate() {
  const { t } = useTranslation();
  const [record, setRecord] = useState({
    name: '',
    permissions: '[]',
    implied_roles: [],
  });
  const query = useModel('role');
  const { create, loading } = query;
  const { notify } = NotificationState((state) => state);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    try {
      e.preventDefault();
      // validate JSON
      try {
        JSON.parse(record.permissions);
      } catch (e) {
        notify({
          message: t('Invalid JSON'),
          type: 'error',
        });
        return;
      }
      await create(record);
      notify({
        message: t('Role created successfully!'),
        type: 'success',
      });
      navigate(-1);
    } catch (e) {
      console.error(e);
      notify({
        message: e.message,
        type: 'error',
      });
    }
  }

  return (
    <main className={`max-w-screen-xl m-auto my-[20px] px-[24px]`}>
      <form onSubmit={handleSubmit}>
        <CreateFormActionBar loading={loading} title={t(`Create role`)} />

        <Card>
          <H1>{t('Role')}</H1>
          {/*Row 1*/}
          <div className={`flex gap-2 my-2`}>
            {/*Column 1*/}
            <div className={`flex flex-col grow max-w-screen-sm`}>
              <TextInput
                label={t('Display name')}
                description={t(`Must be unique`)}
                placeholder={t('Invoice Manager')}
                required
                value={record.name}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    name: e.target.value,
                  })
                }
              />
              <TextArea
                label={t('Description')}
                placeholder={t('Enter Description')}
                value={record.description}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    description: e.target.value,
                  })
                }
              />
              <RecordSelectMulti
                model="role"
                displayField="name"
                searchFields={['name']}
                label={t('Implied roles')}
                placeholder="Select roles"
                value={record.implied_roles}
                onChange={(implied_roles) => setRecord({ ...record, implied_roles })}
              />
              <JsonInput
                label="Permissions"
                description={`In JSON format`}
                validationError="Invalid JSON"
                formatOnBlur
                formatOnPaste
                autosize
                required
                minRows={10}
                value={record.permissions}
                onChange={(value) =>
                  setRecord({
                    ...record,
                    permissions: value,
                  })
                }
              />
            </div>
          </div>
        </Card>
      </form>
    </main>
  );
}
