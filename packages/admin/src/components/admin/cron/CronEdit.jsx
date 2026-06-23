import Card from '../../../common/ui/Card.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';
import H1 from '../../../common/ui/H1.jsx';
import useModel from '../../../common/api/useModel.jsx';
import NotificationState from '../../../common/stores/NotificationState.js';
import { useNavigate, useParams } from 'react-router-dom';
import FormViewSkeleton from '../../../common/ui/FormViewSkeleton.jsx';
import EditFormActionBar from '../../../common/ui/EditFormActionBar.jsx';
import NumberInput from '../../../common/ui/NumberInput.jsx';
import { useTranslation } from 'react-i18next';
import { Switch } from '@mantine/core';
import DateTimePickerInput from '../../../common/ui/DateTimePickerInput.jsx';
import Select from '../../../common/ui/Select.jsx';

export default function CronEdit() {
  const { t } = useTranslation();
  const { id } = useParams();
  const query = useModel('cron', {
    id,
    autoFetch: true,
  });
  const { record, setRecord, update, loading: recordLoading } = query;
  const loading = recordLoading;
  const { notify } = NotificationState((state) => state);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    try {
      e.preventDefault();
      await Promise.all([update(record)]);
      notify({
        message: t('Scheduled Action updated successfully!'),
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
        <EditFormActionBar title={t(`Edit Scheduled Action`)} query={query} />

        {record ? (
          <Card>
            <div className={`flex items-center justify-between`}>
              <H1>{t('Scheduled Action')}</H1>
              <Switch
                label={t('Enabled')}
                checked={record.enabled}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    enabled: e.currentTarget.checked,
                  })
                }
              />
            </div>
            <div className={`flex gap-2 my-2 flex-wrap items-end`}>
              <TextInput
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
              <NumberInput
                label={t('Interval')}
                placeholder={t('Enter Interval')}
                value={record.interval}
                onChange={(value) =>
                  setRecord({
                    ...record,
                    interval: value,
                  })
                }
                min={1}
                required
              />
              <Select
                label={t('Interval Unit')}
                placeholder={t('Enter Interval Unit')}
                data={['minutes', 'hours', 'days', 'weeks', 'months', 'years']}
                searchable
                value={record.interval_unit}
                onChange={(value) =>
                  setRecord({
                    ...record,
                    interval_unit: value,
                  })
                }
                required
              />
            </div>
            <div className={`flex gap-2 my-2 flex-wrap`}>
              <TextInput
                label={t('Model')}
                placeholder={t('Enter Model')}
                value={record.model}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    model: e.target.value,
                  })
                }
                required
              />
              <TextInput
                label={t('Method')}
                placeholder={t('Enter Method')}
                value={record.method}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    method: e.target.value,
                  })
                }
                required
              />
              <TextInput
                label={t('Arguments')}
                placeholder={t('Enter Arguments')}
                value={record.arguments}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    arguments: e.target.value,
                  })
                }
              />
            </div>
            <div className={`flex gap-2 my-2 flex-wrap`}>
              <DateTimePickerInput
                className={`w-full`}
                label={t('Next Run')}
                placeholder={t('Pick a date')}
                value={record.next_run}
                onChange={(value) =>
                  setRecord({
                    ...record,
                    next_run: value,
                  })
                }
              />
            </div>
          </Card>
        ) : (
          <FormViewSkeleton />
        )}
      </form>
    </main>
  );
}
