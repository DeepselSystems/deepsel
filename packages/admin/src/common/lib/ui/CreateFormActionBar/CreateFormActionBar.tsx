import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../Button';
import { useBack } from '../../hooks';
import { IconArrowLeft, IconCheck } from '@tabler/icons-react';

export interface CreateFormActionBarProps {
  /** Whether the form is currently submitting — disables and shows loader on the Save button */
  loading?: boolean;

  /** When true, hides the Back button (used when rendered inside a modal) */
  modalMode?: boolean;

  /** Custom action elements rendered in place of the default Save button */
  customActions?: React.ReactNode;

  /** Optional title (reserved for future use, not rendered) */
  title?: string;
}

/**
 * Action bar for create forms with a Back button and a Save (submit) button.
 * In modal mode the Back button is hidden and the Save button stretches full width.
 */
export function CreateFormActionBar({
  loading,
  modalMode,
  customActions,
}: CreateFormActionBarProps) {
  const { t } = useTranslation();
  const { back } = useBack();

  return (
    <div className="flex w-full justify-between fields-end mb-[12px] items-end">
      {!modalMode && (
        <div>
          <Button className="shadow text-[14px] font-[600]" variant="outline" onClick={back}>
            <IconArrowLeft size={18} className="mr-1" />
            {t('Back')}
          </Button>
        </div>
      )}

      {customActions ? (
        customActions
      ) : (
        <Button
          className={`shadow text-sm font-bold bg-primary-main text-primary-contrastText ${
            modalMode ? 'grow' : ''
          }`}
          disabled={loading}
          loading={loading}
          variant="filled"
          type="submit"
        >
          <IconCheck size={16} className="mr-1" />
          {t('Save')}
        </Button>
      )}
    </div>
  );
}
