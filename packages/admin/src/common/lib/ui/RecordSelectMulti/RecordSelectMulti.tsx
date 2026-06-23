import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, CheckIcon, Combobox, Group, Pill, PillsInput, useCombobox } from '@mantine/core';
import { useShallowEffect } from '@mantine/hooks';
import isEqualWith from 'lodash/isEqualWith';
import isEqual from 'lodash/isEqual';
import { useModel } from '../../hooks';
import type { FilterCondition } from '../../hooks';
import type { User } from '../../types';

/** Generic API record */
type RecordItem = Record<string, unknown>;

/**
 * Optional slot renderers for customizing list item appearance
 */
interface RecordSelectMultiSlots {
  /** Renders content before each option item label */
  preOptionItem?: (item: RecordItem) => React.ReactNode;
}

export interface RecordSelectMultiProps {
  /** Input label */
  label?: string;

  /** Placeholder shown when no value is selected */
  placeholder?: string;

  /** Whether the field is required */
  required?: boolean;

  /** API model name (e.g. 'tag', 'category') */
  model: string;

  /** Currently selected records (array of full record objects) */
  value?: RecordItem[];

  /** Called with the updated array of selected records on each change */
  onChange?: (value: RecordItem[]) => void;

  /** Fields searched when the user types. Defaults to ['name'] */
  searchFields?: string[];

  /**
   * Custom render for each dropdown option.
   * Receives the item and the current selection array.
   */
  renderOption?: (item: RecordItem, selected: RecordItem[]) => React.ReactNode;

  /** Field used for pill display text. Defaults to 'name' */
  displayField?: string;

  /** Number of records per page. Defaults to 5 */
  pageSize?: number;

  /** Additional filters applied to the list query */
  filters?: FilterCondition[];

  /** Optional slot renderers */
  slots?: RecordSelectMultiSlots;

  /**
   * Backend host URL.
   * Typically sourced from BackendHostURLState.
   */
  backendHost: string;

  /**
   * Currently authenticated user.
   * Typically sourced from UserState.
   */
  user: User;

  /**
   * Setter for the user state — used by underlying hooks to clear session on 401.
   * Typically sourced from UserState.
   */
  setUser: (user: User | null) => void;
}

/**
 * Multi-record selector with search, checkmarks, and pill display.
 *
 * Requires backendHost, user, setUser props
 * (sourced from BackendHostURLState / UserState in the consuming app).
 */
export function RecordSelectMulti({
  label,
  placeholder,
  required,
  model,
  value: initialValue,
  onChange,
  searchFields = ['name'],
  renderOption,
  displayField = 'name',
  pageSize = 5,
  filters = [],
  slots,
  backendHost,
  user,
  setUser,
}: RecordSelectMultiProps) {
  const { t } = useTranslation();

  const { data, searchTerm, setSearchTerm } = useModel(
    model,
    { backendHost, user, setUser },
    {
      autoFetch: true,
      pageSize,
      searchFields,
      filters,
    },
  );

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => combobox.updateSelectedOptionIndex('active'),
  });

  const [value, setValue] = useState<RecordItem[]>(initialValue || []);

  /**
   * Sync internal value when initialValue prop changes,
   * skipping the update when contents are deeply equal to avoid unnecessary re-renders.
   */
  useEffect(() => {
    setValue((prevState) => {
      return isEqualWith(prevState, initialValue, (a, b) => isEqual(a, b))
        ? prevState
        : initialValue || [];
    });
  }, [initialValue]);

  /**
   * Emit new value to parent whenever the internal selection changes
   */
  useShallowEffect(() => {
    onChange?.(value);
  }, [onChange, value]);

  /**
   * Toggle selection of an item by its ID string
   */
  const handleValueSelect = useCallback(
    (selectingItem: RecordItem | string | number) => {
      const selectingItemId = typeof selectingItem === 'object' ? selectingItem.id : selectingItem;
      const itemToAdd = data.find((item) => String(item.id) === String(selectingItemId));
      if (!itemToAdd) return;

      setValue((prevState) => {
        const newValue = [...(prevState || [])];
        const existedItemIdx = newValue.findIndex((o) => String(o.id) === String(selectingItemId));
        if (existedItemIdx >= 0) {
          newValue.splice(existedItemIdx, 1);
        } else {
          newValue.push(itemToAdd);
        }
        return newValue;
      });
    },
    [data],
  );

  /**
   * Remove a specific item from the selection
   */
  const handleValueRemove = useCallback((itemToRemove: RecordItem) => {
    setValue((prevState) => {
      return (prevState || []).filter((item) => String(item.id) !== String(itemToRemove.id));
    });
  }, []);

  /**
   * Selected value pills rendered in the input
   */
  const selectedValues = useMemo(
    () =>
      value?.map((item) => (
        <Pill key={String(item.id)} withRemoveButton onRemove={() => handleValueRemove(item)}>
          <div className="flex gap-2 items-center">
            {slots?.preOptionItem && slots.preOptionItem(item)}
            {item[displayField] as React.ReactNode}
          </div>
        </Pill>
      )),
    [displayField, handleValueRemove, slots, value],
  );

  const options = data.map((item) =>
    renderOption ? (
      renderOption(item, value)
    ) : (
      <Combobox.Option
        value={String(item.id)}
        key={String(item.id)}
        active={!!value?.find((v) => String(v.id) === String(item.id))}
      >
        <Group gap="sm">
          <Box className="text-nowrap gap-1">
            {value?.find((v) => String(v.id) === String(item.id)) ? <CheckIcon size={12} /> : null}
            <Box>
              {slots?.preOptionItem && slots.preOptionItem(item)}
              <span>{item[displayField] as React.ReactNode}</span>
            </Box>
          </Box>
        </Group>
      </Combobox.Option>
    ),
  );

  return (
    <Combobox store={combobox} onOptionSubmit={handleValueSelect as any} withinPortal={false}>
      <Combobox.DropdownTarget>
        <PillsInput onClick={() => combobox.openDropdown()} label={label}>
          <Pill.Group>
            {selectedValues}
            <Combobox.EventsTarget>
              <PillsInput.Field
                onFocus={() => combobox.openDropdown()}
                onBlur={() => combobox.closeDropdown()}
                value={searchTerm}
                placeholder={placeholder}
                required={required}
                onChange={(event) => {
                  combobox.updateSelectedOptionIndex();
                  setSearchTerm(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Backspace' && searchTerm.length === 0) {
                    event.preventDefault();
                    handleValueRemove(value[value.length - 1]);
                  }
                }}
              />
            </Combobox.EventsTarget>
          </Pill.Group>
        </PillsInput>
      </Combobox.DropdownTarget>

      <Combobox.Dropdown>
        <Combobox.Options className="max-h-[200px] overflow-y-auto">
          {options.length > 0 ? options : <Combobox.Empty>{t('Nothing found...')}</Combobox.Empty>}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
