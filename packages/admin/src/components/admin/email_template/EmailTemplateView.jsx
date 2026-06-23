import { useTranslation } from 'react-i18next';
import Card from '../../../common/ui/Card.jsx';
import H1 from '../../../common/ui/H1.jsx';
import useModel from '../../../common/api/useModel.jsx';
import { useParams } from 'react-router-dom';
import ReadOnlyField from '../../../common/ui/ReadOnlyField.jsx';
import ViewFormActionBar from '../../../common/ui/ViewFormActionBar.jsx';
import FormViewSkeleton from '../../../common/ui/FormViewSkeleton.jsx';
import IframeContent from '../../../common/ui/IframeContent.jsx';
import Button from '../../../common/ui/Button.jsx';
import { useDisclosure } from '@mantine/hooks';
import { Modal, Alert } from '@mantine/core';
import { useState } from 'react';
import TextInput from '../../../common/ui/TextInput.jsx';
import useFetch from '../../../common/api/useFetch.js';
import NotificationState from '../../../common/stores/NotificationState.js';
import { IconCheck, IconInfoCircle, IconPlus, IconSend } from '@tabler/icons-react';

export default function EmailTemplateView() {
  const { t } = useTranslation();
  const { notify } = NotificationState((state) => state);
  const { id } = useParams();
  const query = useModel('email_template', {
    id,
    autoFetch: true,
  });
  const { post: postTestEmail, loading } = useFetch('email_template/test-send-email');
  const { record } = query;
  const [isOpen, { open, close }] = useDisclosure();
  const [params, setParams] = useState([
    {
      param: '',
      value: '',
    },
  ]);

  function addParam() {
    setParams([
      ...params,
      {
        param: '',
        value: '',
      },
    ]);
  }

  function setParam(index, fieldValue = {}) {
    const paramsClone = [...params];
    const param = paramsClone[index];
    paramsClone[index] = {
      ...param,
      ...fieldValue,
    };
    setParams(paramsClone);
  }

  function convertParamListToObject(params = []) {
    return params.reduce((accumulator, current) => {
      accumulator[current.param] = current.value;
      return accumulator;
    }, {});
  }

  async function handleTestEmail() {
    try {
      await postTestEmail({
        id: record.id,
        params: convertParamListToObject(params),
      });
      notify({
        message: t('Email sent!'),
        type: 'success',
      });
      close();
    } catch (error) {
      console.log(error);
      notify({
        message: error.message,
        type: 'error',
      });
    }
  }

  return (
    <main className={`max-w-screen-xl m-auto my-[50px] px-[24px]`}>
      <ViewFormActionBar query={query} />

      {record ? (
        <Card>
          <div className="flex justify-between">
            <H1>{t('Email Template')}</H1>
            <Button onClick={() => open()}>
              <IconSend size={18} className="mr-2" />
              {t('Send Test Email')}
            </Button>
          </div>

          <div className={`flex gap-4 my-4 flex-wrap`}>
            <ReadOnlyField label={t('Name')} value={record.name} />
            <ReadOnlyField label={t('Subject')} value={record.subject} />
          </div>

          <div className={`flex gap-4 my-4 flex-wrap h-[600px]`}>
            <IframeContent html={record.content} className={`w-full`} />
          </div>
        </Card>
      ) : (
        <FormViewSkeleton />
      )}

      <Modal
        opened={isOpen}
        onClose={close}
        title={<div className={`font-semibold text-lg`}>{t('Send Test Email')}</div>}
        // size={700}
      >
        <div className=" pt-4 flex flex-col">
          <Alert
            variant="light"
            color="blue"
            className={`mb-4`}
            icon={<IconInfoCircle size={16} />}
          >
            {t('A test email will be sent to all users with role ‘Email Tester’')}
          </Alert>
          {params.map((param, index) => (
            <div className="flex items-center gap-2 mb-2" key={index}>
              <TextInput
                label={t('Variable Name')}
                placeholder={t('Enter Variable Name')}
                value={param.param}
                onChange={(e) =>
                  setParam(index, {
                    param: e.target.value,
                  })
                }
              />
              <TextInput
                label={t('Variable Value')}
                placeholder={t('Enter Variable Value')}
                value={param.value}
                onChange={(e) =>
                  setParam(index, {
                    value: e.target.value,
                  })
                }
              />
            </div>
          ))}
          <button
            className={`mt-4 w-fit text-primary-main text-left p-2 hover:bg-primary-main hover:text-primary-contrastText rounded-md text-xs font-semibold`}
            onClick={() => addParam()}
          >
            <IconPlus size={16} className="mr-1" />
            {t('Add Variable')}
          </button>
          <Button className="mx-auto mt-20 !w-full" onClick={handleTestEmail} loading={loading}>
            <IconCheck size={16} className="mr-2" />
            {t('Send Test Email')}
          </Button>
        </div>
      </Modal>
    </main>
  );
}
