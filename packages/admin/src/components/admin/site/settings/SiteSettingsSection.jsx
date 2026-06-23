import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../../../../common/ui/Card.jsx';
import H1 from '../../../../common/ui/H1.jsx';
import EditFormActionBar from '../../../../common/ui/EditFormActionBar.jsx';
import FormViewSkeleton from '../../../../common/ui/FormViewSkeleton.jsx';
import useModel from '../../../../common/api/useModel.jsx';
import NotificationState from '../../../../common/stores/NotificationState.js';
import OrganizationIdState from '../../../../common/stores/OrganizationIdState.js';
import useShowSiteSelector from '../../../../common/hooks/useShowSiteSelector.js';

export default function SiteSettingsSection({
  title,
  children,
  onSubmit,
  showActionBar = true,
  extraLoading = false,
}) {
  useShowSiteSelector();
  const { t } = useTranslation();
  const { organizationId } = OrganizationIdState();
  const query = useModel('organization', {
    id: organizationId,
    autoFetch: !!organizationId,
  });
  const { record, setRecord, update, loading: orgLoading, getOne: refetchOrg } = query;
  const { notify } = NotificationState((state) => state);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!onSubmit) return;
    try {
      setSubmitting(true);
      await onSubmit({ record, setRecord, update, refetchOrg });
      notify({
        message: t('Saved!'),
        type: 'success',
      });
    } catch (error) {
      console.error(error);
      notify({
        message: error.message,
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!organizationId) {
    return (
      <div className={`max-w-screen-xl m-auto my-[20px] px-[24px]`}>
        <Card className={`shadow-none border-none text-center p-8`}>
          <H1>{title}</H1>
          <div className="mt-4 text-gray-500">
            {t('Please select a website from the dropdown above to manage its settings.')}
          </div>
        </Card>
      </div>
    );
  }

  const body = record ? (
    <Card className={`shadow-none border-none`}>
      <H1>{title}</H1>
      <div className="mt-6">
        {children({ record, setRecord, update, refetchOrg, organizationId })}
      </div>
    </Card>
  ) : (
    <FormViewSkeleton />
  );

  const loading = submitting || orgLoading || extraLoading;

  if (!showActionBar) {
    return <div className={`max-w-screen-xl m-auto my-[20px] px-[24px]`}>{body}</div>;
  }

  return (
    <form className={`max-w-screen-xl m-auto my-[20px] px-[24px]`} onSubmit={handleSubmit}>
      <EditFormActionBar loading={loading} />
      {body}
    </form>
  );
}
