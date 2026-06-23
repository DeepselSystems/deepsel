import React from 'react';
import useOrganization from '../hooks/useOrganization.js';
import { Input, InputBase, Combobox, useCombobox } from '@mantine/core';
import { useId } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import fromPairs from 'lodash/fromPairs';
import sortBy from 'lodash/sortBy';
import Button from './Button.jsx';
import VisibilityControl from '../auth/VisibilityControl.jsx';
import { IconPlus } from '@tabler/icons-react';

// Removed _ALL_SITES_SELECTION_KEY since we don't want "All Sites" option

/**
 * Site selector
 *
 * @param {import('@mantine/core').ClassNames=} inputClassNames
 * @param {Organization | null} value
 * @param {(value: Organization | null) => void} setValue
 * @param {Array<number>} exceptedIds
 * @param {function} onAddClick - Click handler for add new button
 * @returns {JSX.Element}
 *
 * @constructor
 */
const SiteSelector = ({ value, setValue, exceptedIds = [], inputClassNames = {}, onAddClick }) => {
  // uniq id
  const _id = useId();

  // translation
  const { t } = useTranslation();

  // combobox controller
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  // organization hook - current sites
  const { sites } = useOrganization();

  /**
   * @type {Dictionary<Organization>}
   */
  const sitesMap = React.useMemo(() => {
    // Return empty is there are no any site
    if (!sites.length) {
      return {};
    }

    // Return only the actual sites (no "All Sites" option)
    return fromPairs(
      sites.filter((site) => !exceptedIds.includes(site.id)).map((site) => [String(site.id), site]),
    );
  }, [sites, exceptedIds]);

  /**
   * @type {Array<Organization>}
   */
  const siteOptions = React.useMemo(() => {
    return sortBy(Object.values(sitesMap), (site) => site.id);
  }, [sitesMap]);

  /**
   * Selected site id
   *
   * @type {string | null}
   */
  const selectedSiteId = React.useMemo(() => {
    if (value?.id) {
      return String(value?.id);
    }
    return null;
  }, [value?.id]);

  /**
   * Handle change site
   *
   * @type {(function(*): void)|*}
   */
  const handleChangeSite = React.useCallback(
    (siteId) => {
      if (setValue) {
        setValue(sitesMap[String(siteId)] || null);
      }
    },
    [sitesMap, setValue],
  );

  return (
    <>
      <Combobox
        store={combobox}
        onOptionSubmit={(val) => {
          handleChangeSite(val);
          combobox.closeDropdown();
        }}
      >
        <Combobox.Target>
          <InputBase
            classNames={inputClassNames}
            component="button"
            type="button"
            pointer
            onClick={() => combobox.toggleDropdown()}
            rightSection={<Combobox.Chevron />}
            rightSectionPointerEvents={value === null ? 'none' : 'all'}
          >
            {(selectedSiteId && sitesMap[String(selectedSiteId)]?.name) || (
              <Input.Placeholder>{t('Select a Site')}</Input.Placeholder>
            )}
          </InputBase>
        </Combobox.Target>

        <Combobox.Dropdown>
          <Combobox.Options>
            {siteOptions.length ? (
              <>
                {siteOptions.map((site, index) => (
                  <Combobox.Option value={site.id} key={`${_id}_${index}`}>
                    {site.name}
                  </Combobox.Option>
                ))}
                {onAddClick && (
                  <VisibilityControl roleIds={['super_admin_role', 'admin_role']}>
                    <>
                      <div className="border-t border-gray-200 my-1" />
                      <Button
                        variant="subtle"
                        leftSection={<IconPlus size={16} />}
                        onClick={() => {
                          combobox.closeDropdown();
                          onAddClick();
                        }}
                        justify="start"
                        fullWidth
                        radius={0}
                        size="sm"
                        styles={{
                          root: {
                            border: 0,
                            margin: 0,
                            padding: '8px 12px',
                            height: 'auto',
                            minHeight: 0,
                            color: '#dc0018',
                            backgroundColor: 'transparent',
                            '&:hover': {
                              backgroundColor: '#dc0018',
                              color: 'white',
                            },
                          },
                          inner: {
                            justifyContent: 'flex-start',
                          },
                          label: {
                            textAlign: 'left',
                          },
                        }}
                      >
                        {t('Add website')}
                      </Button>
                    </>
                  </VisibilityControl>
                )}
              </>
            ) : (
              <Combobox.Empty>{t('Nothing found')}</Combobox.Empty>
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </>
  );
};

export default SiteSelector;
