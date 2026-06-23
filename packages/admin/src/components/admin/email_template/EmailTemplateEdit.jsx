import { useTranslation } from 'react-i18next';
import Card from '../../../common/ui/Card.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';
import H1 from '../../../common/ui/H1.jsx';
import useModel from '../../../common/api/useModel.jsx';
import NotificationState from '../../../common/stores/NotificationState.js';
import { useNavigate, useParams } from 'react-router-dom';
import FormViewSkeleton from '../../../common/ui/FormViewSkeleton.jsx';
import EditFormActionBar from '../../../common/ui/EditFormActionBar.jsx';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-jsx';
import 'prismjs/themes/prism.css';
import H3 from '../../../common/ui/H3.jsx';
import IframeContent from '../../../common/ui/IframeContent.jsx';

export default function EmailTemplateEdit() {
  const { t } = useTranslation();
  const { id } = useParams();
  const query = useModel('email_template', {
    id,
    autoFetch: true,
  });
  const { record, setRecord, update, loading } = query;
  const { notify } = NotificationState((state) => state);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    try {
      e.preventDefault();
      await Promise.all([update(record)]);
      notify({
        message: t('Email Template updated successfully!'),
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
    <form onSubmit={handleSubmit} className={`max-w-screen-2xl m-auto my-[20px] px-[24px]`}>
      <EditFormActionBar title={t(`Edit Email Template`)} query={query} loading={loading} />

      {record ? (
        <Card>
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
        </Card>
      ) : (
        <FormViewSkeleton />
      )}
    </form>
  );
}
