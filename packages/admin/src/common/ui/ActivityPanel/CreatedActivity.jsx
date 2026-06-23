import { useTranslation } from 'react-i18next';

export default function CreatedActivity({ activity }) {
  const { t } = useTranslation();

  return <div>{t('created this record')}</div>;
}
