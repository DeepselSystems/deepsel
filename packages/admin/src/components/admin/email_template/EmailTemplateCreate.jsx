import { highlight, languages } from 'prismjs/components/prism-core.js';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Editor from 'react-simple-code-editor';
import useModel from '../../../common/api/useModel.jsx';
import NotificationState from '../../../common/stores/NotificationState.js';
import CreateFormWrapper from '../../../common/ui/CreateFormWrapper.jsx';
import H1 from '../../../common/ui/H1.jsx';
import H3 from '../../../common/ui/H3.jsx';
import IframeContent from '../../../common/ui/IframeContent.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';

export default function EmailTemplateCreate(props) {
  const { t } = useTranslation();
  const { modalMode, onSuccess } = props;
  const [record, setRecord] = useState({
    name: '',
    content: '',
  });
  const { create, loading } = useModel('email_template');
  const { notify } = NotificationState((state) => state);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    try {
      e.preventDefault();
      const created = await create(record);
      await Promise.all([]);
      notify({
        message: t('Email Template created successfully!'),
        type: 'success',
      });
      if (onSuccess) {
        onSuccess(created);
      } else {
        navigate(-1);
      }
    } catch (error) {
      console.error(error);
      notify({
        message: error.message,
        type: 'error',
      });
    }
  }

  return (
    <CreateFormWrapper
      onSubmit={handleSubmit}
      modalMode={modalMode}
      loading={loading}
      title={t(`Create Email Template`)}
    >
      <H1>{t('Email Template')}</H1>
      <div className={`flex gap-2 my-2 flex-wrap`}>
        <TextInput
          className={`w-full`}
          label={t('Name')}
          placeholder={t('Enter Name')}
          value={record.name}
          onChange={(e) =>
            setRecord({
              ...record,
              name: e.target.value,
            })
          }
          required
        />
        <TextInput
          className={`w-full`}
          label={t('Subject')}
          placeholder={t('Enter Subject')}
          value={record.subject}
          onChange={(e) =>
            setRecord({
              ...record,
              subject: e.target.value,
            })
          }
          required
        />
      </div>

      <H3>{t('Content')}</H3>
      <div className={`grid grid-cols-2 gap-2 my-2`}>
        <div className={`max-h-[600px] overflow-y-auto border border-gray-border rounded`}>
          <Editor
            className="w-full min-h-full"
            value={record?.content}
            onValueChange={(code) =>
              setRecord({
                ...record,
                content: code,
              })
            }
            highlight={(code) => highlight(code, languages.jsx, 'jsx')}
            padding={10}
            style={{
              fontSize: 12,
              backgroundColor: '#f6f8fa',
            }}
          />
        </div>
        <div className={`grow h-[600px]`}>
          <IframeContent html={record.content} className={`w-full h-full`} />
        </div>
      </div>
    </CreateFormWrapper>
  );
}
