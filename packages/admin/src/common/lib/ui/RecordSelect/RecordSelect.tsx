import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InputBase, Combobox, useCombobox, CloseButton, Modal, ScrollArea } from '@mantine/core';

import { useModel } from '../../hooks';
import type { FilterCondition } from '../../hooks';
import type { User } from '../../types';
import { IconPlus } from '@tabler/icons-react';

/** Generic API record — all fields are unknown at the type level */
type RecordItem = Record<string, unknown>;

/**
 * Props for the create-record view rendered inside the modal.
 * The view receives modalMode=true and an onSuccess callback.
 */
type CreateViewComponent = React.ComponentType<{
  modalMode?: boolean;
  onSuccess?: (record: RecordItem) => void;
}>;

export interface RecordSelectProps {
  /** Input label */
  label?: string;

  /** Input description (shown below label) */
  description?: string;

  /** Placeholder text shown when no value is selected */
  placeholder?: string;

  /** Whether the field is required */
  required?: boolean;

  /** API model name (e.g. 'user', 'category') */
  model: string;

  /** Currently selected value — integer ID or "model/string_id" slug */
  value?: string | number | null;

  /** Called with the selected ID (or null when cleared) */
  onChange: (value: string | number | null) => void;

  /** Fields searched when the user types. Defaults to ['name'] */
  searchFields?: string[];

  /** Custom render for each dropdown option */
  renderOption?: (item: RecordItem) => React.ReactNode;

  /** Custom render for the selected value display text */
  renderValue?: (item: RecordItem) => string;

  /** Field used for display text when renderOption/renderValue not provided. Defaults to 'name' */
  displayField?: string;

  /** Optional create-record view rendered in a modal when user clicks "+ Create" */
  createView?: CreateViewComponent;

  /** Number of records per page. Defaults to 5 */
  pageSize?: number;

  /** Additional filters applied to the list query */
  filters?: FilterCondition[];

  /** Mantine input size. Defaults to 'md' */
  size?: string;

  /** Mantine input radius. Defaults to 'md' */
  radius?: string;

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

  /** Additional props passed through to the Mantine Combobox */
  [key: string]: unknown;
}

/**
 * Single-record selector with search, pagination, and optional inline create.
 *
 * Requires backendHost, user, setUser props
 * (sourced from BackendHostURLState / UserState in the consuming app).
 */
/**
 * Convert value to number if possible, otherwise keep as string or null
 * @param val - The value to normalize
 * @returns Normalized value (number, string, or null)
 */
function normalizeValue(val: string | number | null): string | number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;

  const numVal = Number(val);
  if (!isNaN(numVal) && val !== '') {
    return numVal;
  }

  return val;
}

export function RecordSelect({
  label,
  description,
  placeholder,
  required,
  model,
  value: initialValue,
  onChange,
  searchFields = ['name'],
  renderOption,
  renderValue,
  displayField = 'name',
  createView,
  pageSize = 5,
  filters = [],
  size = 'md',
  radius = 'md',
  backendHost,
  user,
  setUser,
  ...otherProps
}: RecordSelectProps) {
  const { t } = useTranslation();

  const config = { backendHost, user, setUser };

  // Main list query — used to populate dropdown options
  const { data, searchTerm, setSearchTerm } = useModel(model, config, {
    autoFetch: true,
    pageSize,
    searchFields,
    filters,
  });

  // Determine initial value type once — hooks must always be called unconditionally
  const isIntegerId = initialValue != null && !isNaN(Number(initialValue));
  const isStringId = typeof initialValue === 'string' && initialValue.includes('/');

  // Fetch initial record by integer ID
  const idRecordQuery = useModel(model, config, {
    id: isIntegerId ? Number(initialValue) : undefined,
    autoFetch: isIntegerId,
  });

  // Fetch initial record by string_id slug ("model/slug")
  const stringIdRecordQuery = useModel(model, config, {
    filters: isStringId
      ? [{ field: 'string_id', operator: '=', value: String(initialValue).split('/')[1] }]
      : [],
    autoFetch: isStringId,
  });

  const [value, setValue] = useState<string | number | null>(normalizeValue(initialValue ?? null));
  const [showModal, setShowModal] = useState(false);

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const options = data.map((item) => (
    <Combobox.Option value={String(item.id)} key={String(item.id)}>
      {renderOption ? renderOption(item) : (item[displayField] as React.ReactNode)}
    </Combobox.Option>
  ));

  // Run once on mount — set searchTerm to display name of the initial value
  useEffect(() => {
    if (!initialValue) return;

    let initialRecord: RecordItem | null = null;

    if (isIntegerId && (idRecordQuery.record || idRecordQuery.data)) {
      initialRecord = idRecordQuery.record as RecordItem | null;
    } else if (isStringId && (stringIdRecordQuery.record || stringIdRecordQuery.data)) {
      initialRecord = (stringIdRecordQuery.data[0] as RecordItem | null) ?? null;
    }

    if (initialRecord) {
      const displayText = renderValue
        ? renderValue(initialRecord)
        : (initialRecord[displayField] as string);
      setSearchTerm(displayText);
    }
  }, [
    initialValue,
    idRecordQuery.record,
    idRecordQuery.data,
    stringIdRecordQuery.record,
    stringIdRecordQuery.data,
    displayField,
    renderValue,
    setSearchTerm,
    isIntegerId,
    isStringId,
  ]);

  // Sync internal value when the prop changes
  useEffect(() => {
    setValue(normalizeValue(initialValue ?? null));
  }, [initialValue]);

  /**
   * Clear the selected value and reset the search input
   */
  function clear() {
    setValue(null);
    setSearchTerm('');
    onChange(null);
  }

  const CreateView = createView;

  return (
    <>
      <Combobox
        {...otherProps}
        store={combobox}
        onOptionSubmit={(val) => {
          const normalized = normalizeValue(val as string | number);
          onChange(normalized);
          setValue(normalized);
          const selectedItem = data.find((item) => item.id === val);
          if (selectedItem) {
            const displayText = renderValue
              ? renderValue(selectedItem)
              : (selectedItem[displayField] as string);
            setSearchTerm(displayText);
          }
          combobox.closeDropdown();
        }}
      >
        <Combobox.Target>
          <InputBase
            onClick={() => combobox.openDropdown()}
            onFocus={() => combobox.openDropdown()}
            onBlur={() => {
              combobox.closeDropdown();
              // When focus moves away, restore display text from current value or clear
              if (data?.length > 0) {
                const item = data.find((item) => item.id === value);
                setSearchTerm(item ? (item[displayField] as string) : '');
              }
            }}
            label={label}
            description={description}
            placeholder={placeholder}
            value={searchTerm}
            required={required}
            onChange={(event) => {
              combobox.updateSelectedOptionIndex();
              setSearchTerm(event.currentTarget.value);
            }}
            rightSection={
              value != null && value !== '' ? (
                <CloseButton
                  size="sm"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clear}
                  aria-label="Clear value"
                />
              ) : (
                <Combobox.Chevron />
              )
            }
            rightSectionPointerEvents={value != null && value !== '' ? 'all' : 'none'}
            size={size}
            radius={radius}
          />
        </Combobox.Target>

        <Combobox.Dropdown>
          <Combobox.Options>
            <ScrollArea.Autosize type="scroll" mah={300}>
              {options.length > 0 ? options : <Combobox.Empty>{t('Nothing found')}</Combobox.Empty>}
              {CreateView && (
                <button
                  className="w-full border-t border-gray-border text-primary-main text-left p-2 hover:bg-primary-main hover:text-primary-contrastText rounded-b text-xs font-semibold"
                  onClick={() => setShowModal(true)}
                >
                  <IconPlus size={18} className="mr-1" />
                  {t('Create')}
                </button>
              )}
            </ScrollArea.Autosize>
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>

      <Modal
        opened={showModal}
        title={<div className="text-lg font-semibold">{t('Create')}</div>}
        onClose={() => setShowModal(false)}
        size="2xl"
      >
        {CreateView && (
          <CreateView
            modalMode={true}
            onSuccess={(record) => {
              const normalized = normalizeValue(record.id as string | number);
              setValue(normalized);
              onChange(normalized);
              setSearchTerm(record[displayField] as string);
              setShowModal(false);
            }}
          />
        )}
      </Modal>
    </>
  );
}
