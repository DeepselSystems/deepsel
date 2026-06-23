import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { capitalizeFirstLetter } from '../../utils';

export default function UpdatedActivity({ activity }) {
  const { t } = useTranslation();

  const renderValue = (value, type) => {
    switch (type) {
      case 'string':
        return value ? capitalizeFirstLetter(value).replace('_', ' ') : t('N/A');
      case 'integer':
        return value;
      case 'boolean':
        return value ? t('True') : t('False');
      case 'datetime':
        return value ? dayjs(value).format('MM/DD/YYYY HH:mm') : t('N/A');
      case 'numeric':
        return value;
      case 'enum':
        return value ? capitalizeFirstLetter(value).replace('_', ' ') : t('N/A');
      default:
        return value;
    }
  };

  if (activity.changes.length > 1) {
    return (
      <>
        {t('updated fields')}
        {activity.changes.map((change, index) => (
          <div key={index} className="ml-4 mt-1">
            •{' '}
            <span className="font-bold">
              {capitalizeFirstLetter(change.field).replace('_', ' ')}
            </span>
            : {t('from')}{' '}
            <span className="font-bold">{renderValue(change.old_value, change.type)}</span>{' '}
            {t('to')}{' '}
            <span className="font-bold">{renderValue(change.new_value, change.type)}</span>
          </div>
        ))}
      </>
    );
  } else {
    return (
      <>
        {t('updated field ')}
        <span className="font-bold">
          {capitalizeFirstLetter(activity.changes[0].field).replace('_', ' ')}
        </span>{' '}
        {t('from')}{' '}
        <span className="font-bold">
          {renderValue(activity.changes[0].old_value, activity.changes[0].type)}
        </span>{' '}
        {t('to')}{' '}
        <span className="font-bold">
          {renderValue(activity.changes[0].new_value, activity.changes[0].type)}
        </span>
      </>
    );
  }
}
