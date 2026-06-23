import { useState } from 'react';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

import Card from '../../../common/ui/Card.jsx';
import H1 from '../../../common/ui/H1.jsx';
import useModel from '../../../common/api/useModel.jsx';
import useFetch from '../../../common/api/useFetch.js';
import NotificationState from '../../../common/stores/NotificationState.js';

import ReadOnlyField from '../../../common/ui/ReadOnlyField.jsx';
import ViewFormActionBar from '../../../common/ui/ViewFormActionBar.jsx';
import FormViewSkeleton from '../../../common/ui/FormViewSkeleton.jsx';
import Checkbox from '../../../common/ui/Checkbox.jsx';
import Button from '../../../common/ui/Button.jsx';
import { IconPlayerPlay } from '@tabler/icons-react';

export default function CronView() {
  const { t } = useTranslation();
  const { id } = useParams();
  const query = useModel('cron', { id, autoFetch: true });
  const { record, getOne } = query;
  const { notify } = NotificationState();
  const { get: executeCron } = useFetch(`cron/execute/${id}`);
  const [loading, setLoading] = useState(false);

  async function execute() {
    setLoading(true);
    try {
      await executeCron();
      await getOne(id);
      notify({
        message: t('Cron executed successfully'),
        type: 'success',
      });
    } catch (e) {
      console.error(e);
      notify({
        message: t('Failed to execute cron'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={`max-w-screen-xl m-auto my-[50px] px-[24px]`}>
      <ViewFormActionBar query={query} />

      {record ? (
        <form>
          <Card>
            <div className={`flex justify-between items-center`}>
              <H1>{t('Scheduled Action')}</H1>
              <Button onClick={execute} loading={loading}>
                <IconPlayerPlay size={18} className="mr-1" />
                Execute Manually
              </Button>
            </div>

            <div className={`flex gap-4 my-4 flex-wrap`}>
              <ReadOnlyField label={t('Name')} value={record.name} />
              <ReadOnlyField label={t('Interval')} value={record.interval} />
              <ReadOnlyField label={t('Interval Unit')} value={record.interval_unit} />
              <Checkbox label={t('Enabled')} checked={record.enabled} />
            </div>
            <div className={`flex gap-4 my-4 flex-wrap`}>
              <ReadOnlyField label={t('Model')} value={record.model} />
              <ReadOnlyField label={t('Method')} value={record.method} />
              <ReadOnlyField label={t('Arguments')} value={record.arguments} />
            </div>
            <div className={`flex gap-4 my-4 flex-wrap`}>
              <ReadOnlyField
                label={t('Last Run')}
                value={
                  record?.last_run &&
                  dayjs.utc(record.last_run).local().format('DD/MM/YYYY HH:mm:ss')
                }
              />
              <ReadOnlyField
                label={t('Next Run')}
                value={
                  record?.next_run &&
                  dayjs.utc(record.next_run).local().format('DD/MM/YYYY HH:mm:ss')
                }
              />
            </div>
          </Card>
        </form>
      ) : (
        <FormViewSkeleton />
      )}
    </main>
  );
}
