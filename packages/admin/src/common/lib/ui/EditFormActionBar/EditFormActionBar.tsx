import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../Button';
import { useBack } from '../../hooks';
import { IconArrowLeft, IconCheck } from '@tabler/icons-react';

/** Slot overrides for injecting additional buttons */
interface EditFormActionBarSlots {
  /** Button rendered before the Save button */
  prependButton?: React.ReactNode;
}

export interface EditFormActionBarProps {
  /** Whether the form is currently submitting — disables and shows loader on the Save button */
  loading?: boolean;

  /** Custom slot overrides */
  slot?: EditFormActionBarSlots;

  /** When false, hides the Back button. Defaults to true */
  showBack?: boolean;
}

/**
 * Action bar for edit forms with a Back button and a Save (submit) button.
 */
export function EditFormActionBar({ loading, slot, showBack = true }: EditFormActionBarProps) {
  const { t } = useTranslation();
  const { back } = useBack();

  return (
    <div className="flex w-full justify-between roles-end mb-[12px]">
      <div>
        {showBack && (
          <Button className="shadow text-[14px] font-[600]" variant="outline" onClick={back}>
            <IconArrowLeft size={18} className="mr-1" />
            {t('Back')}
          </Button>
        )}
      </div>

      <div>
        {slot?.prependButton && slot.prependButton}
        <Button
          className="shadow text-[14px] font-[600] bg-green-500 text-white ml-2"
          disabled={loading}
          loading={loading}
          variant="filled"
          type="submit"
        >
          <IconCheck size={16} className="mr-1" />
          {t('Save')}
        </Button>
      </div>
    </div>
  );
}
