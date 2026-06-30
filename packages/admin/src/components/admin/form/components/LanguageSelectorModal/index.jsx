import React from 'react';
import { Modal } from '@mantine/core';
import { getFlagUrl } from '@deepsel/cms-utils/flags';
import RecordSelect from '../../../../../common/ui/RecordSelect.jsx';
import Button from '../../../../../common/ui/Button.jsx';
import { useTranslation } from 'react-i18next';

/**
 * Language selector modal
 *
 * @type {React.ForwardRefExoticComponent<React.PropsWithoutRef<{
 * readonly formContents: Array<FormContent>,
 * readonly locales: Array<Locale>,
 * readonly onAdd?: (selectedLocaleId: number, locale: Locale) => void,
 * }>
 * & React.RefAttributes<{
 *   readonly open: () => {}
 * }>>}
 */
const LanguageSelectorModal = React.forwardRef(
  ({ formContents = [], locales = [], onAdd = () => {} }, ref) => {
    // Translation
    const { t } = useTranslation();

    // Visible state
    const [opened, setOpened] = React.useState(false);

    // Selected localed id state
    const [selectedLocaleId, setSelectedLocaleId] = React.useState(null);

    /**
     * Handle click add button
     * @type {(function(): void)|*}
     */
    const handleClickAdd = React.useCallback(() => {
      const locale = locales.find((o) => String(o.id) === String(selectedLocaleId));
      onAdd(selectedLocaleId, locale);
      setOpened(false);
    }, [locales, onAdd, selectedLocaleId]);

    /**
     * Handle ref
     */
    React.useImperativeHandle(ref, () => ({
      open: () => {
        setSelectedLocaleId(null);
        setOpened(true);
      },
    }));

    return (
      <>
        <Modal
          opened={opened}
          onClose={setOpened}
          title={<div className="font-bold">{t('Add New Language')}</div>}
          size="md"
          radius={0}
          transitionProps={{ transition: 'fade', duration: 200 }}
        >
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-4">
              {t('Select a language to add a new form.')}
            </p>

            <RecordSelect
              model="locale"
              displayField="name"
              pageSize={1000}
              searchFields={['name', 'iso_code']}
              label={t('Language')}
              placeholder={t('Select a Language')}
              required
              value={selectedLocaleId}
              onChange={setSelectedLocaleId}
              renderOption={(option) => (
                <span>
                  <img
                    src={getFlagUrl(option.iso_code)}
                    alt={option.name}
                    className="h-4 w-auto rounded-sm inline-block"
                  />{' '}
                  {option.name}
                </span>
              )}
              filter={{
                id: {
                  $nin: formContents.map((t) => t.locale_id).filter(Boolean),
                },
              }}
              filters={
                formContents.map((content) => ({
                  field: 'id',
                  operator: '!=',
                  value: content.locale_id,
                })) || []
              }
            />

            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={() => setOpened(false)} className="mr-2">
                {t('Cancel')}
              </Button>
              <Button disabled={!selectedLocaleId} onClick={handleClickAdd}>
                {t('Add Language')}
              </Button>
            </div>
          </div>
        </Modal>
      </>
    );
  },
);

LanguageSelectorModal.displayName = 'LanguageSelectorModal';
export default LanguageSelectorModal;
