import { useTranslation } from 'react-i18next';
import Card from '../../../common/ui/Card.jsx';
import H1 from '../../../common/ui/H1.jsx';
import useModel from '../../../common/api/useModel.jsx';
import { useParams } from 'react-router-dom';
import ReadOnlyField from '../../../common/ui/ReadOnlyField.jsx';
import ViewFormActionBar from '../../../common/ui/ViewFormActionBar.jsx';
import FormViewSkeleton from '../../../common/ui/FormViewSkeleton.jsx';
import RecordChipDisplay from '../../../common/ui/RecordChipDisplay.jsx';

export default function RoleView() {
  const { t } = useTranslation();
  const { id } = useParams();
  const query = useModel('role', {
    id,
    autoFetch: true,
  });
  const { record } = query;
  return (
    <main className={`max-w-screen-xl m-auto my-[50px] px-[24px]`}>
      <ViewFormActionBar query={query} />

      {record ? (
        <form>
          <Card>
            <H1>{t('Role')}</H1>
            {/*Row 1*/}
            <div className={`flex gap-2 my-2`}>
              {/*Column 1*/}
              <div className={`flex flex-col grow max-w-screen-sm gap-2`}>
                <ReadOnlyField label={t('Display name')} value={record.name} />
                <ReadOnlyField label={t('Description')} value={record.description} />
                <ReadOnlyField
                  label={t(`Implied Roles`)}
                  description={t(
                    `This role automatically includes all permissions from these roles`,
                  )}
                >
                  <div className={`flex gap-1 items-center flex-wrap`}>
                    {record.implied_roles?.map((role) => (
                      <RecordChipDisplay
                        key={role.id}
                        name={role.name}
                        linkTo={`/roles/${role.id}`}
                      />
                    ))}
                  </div>
                </ReadOnlyField>
                <ReadOnlyField label={t('Permissions')} description={t(`In JSON format`)}>
                  <div className={`bg-gray-200 text-gray-700 p-2 text-xs rounded font-mono`}>
                    {record.permissions}
                  </div>
                </ReadOnlyField>
              </div>
            </div>
          </Card>
        </form>
      ) : (
        <FormViewSkeleton />
      )}
    </main>
  );
}
