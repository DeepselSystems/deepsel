import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  GridColumnMenuContainer,
  GridColumnsMenuItem,
  HideGridColMenuItem,
  SortGridMenuItems,
} from '@mui/x-data-grid';
import type { GridColumnMenuProps } from '@mui/x-data-grid';
import { MenuItem } from '@mui/material';
import { Button, Popover } from '@mantine/core';
import { Select } from '../Select';
import { TextInput } from '../TextInput';
import { NumberInput } from '../NumberInput';
import { DateTimePickerInput } from '../DateTimePickerInput';
import { RadioGroup } from '../RadioGroup';
import { Radio } from '../Radio';
import { MultiSelect } from '../MultiSelect';
import { useAPISchema } from '../../hooks';
import type { OpenAPISchema } from '../../types';
import type { NotifyFn } from '../../types';
import type { FilterCondition } from '../../hooks';
import { IconPlus } from '@tabler/icons-react';

/** A single available filter definition for a column */
interface AvailableFilter {
  label: string;
  operatorValue: string;
  valueType: string;
  enum?: string[];
}

/** Query state passed from the parent DataGrid */
interface DataGridQuery {
  modelName: string;
  filters: FilterCondition[];
  setFilters: (filters: FilterCondition[]) => void;
}

export interface DataGridColumnMenuProps extends GridColumnMenuProps {
  /** Query state containing modelName, filters, and setFilters */
  query: DataGridQuery;

  /**
   * Raw OpenAPI schema from the backend (/openapi.json).
   * Typically sourced from createAPISchemaState in the consuming app.
   */
  apiSchema: OpenAPISchema | null;

  /**
   * Callback to display toast/snackbar notifications.
   * Sourced from the consuming app's notification store
   * (e.g. `NotificationState.getState().notify`).
   */
  notify: NotifyFn;
}

/**
 * Custom column menu for MUI DataGrid with filter support.
 * Requires apiSchema prop (sourced from createAPISchemaState in the consuming app).
 */
export function DataGridColumnMenu({
  hideMenu,
  currentColumn,
  open,
  query,
  apiSchema,
  notify,
  ...other
}: DataGridColumnMenuProps) {
  const { t } = useTranslation();
  const { modelName, filters, setFilters } = query;
  const { getFieldColTypes } = useAPISchema(modelName, apiSchema);

  const [selectedFilter, setSelectedFilter] = useState<AvailableFilter | null>(null);
  const [selectedValue, setSelectedValue] = useState<string>('');

  const colTypes = useMemo(
    () => getFieldColTypes(currentColumn.field),
    [getFieldColTypes, currentColumn.field],
  );

  const availableFilters = useMemo<AvailableFilter[]>(() => {
    let result: AvailableFilter[] = [];
    const types = colTypes.map((type) => type.type);

    if (types.includes('string')) {
      result = result.concat([
        { label: 'Contains', operatorValue: 'ilike', valueType: 'string' },
        { label: 'One of', operatorValue: 'in', valueType: 'Array<string>' },
        { label: 'Equals', operatorValue: '=', valueType: 'string' },
        { label: 'Is not', operatorValue: '!=', valueType: 'string' },
      ]);
    }

    if (types.includes('number') || types.includes('integer')) {
      result = result.concat([
        { label: 'Equals', operatorValue: '=', valueType: 'number' },
        { label: 'One of', operatorValue: 'in', valueType: 'Array<number>' },
        { label: '>', operatorValue: '>', valueType: 'number' },
        { label: '>=', operatorValue: '>=', valueType: 'number' },
        { label: '<', operatorValue: '<', valueType: 'number' },
        { label: '<=', operatorValue: '<=', valueType: 'number' },
        { label: 'Is not', operatorValue: '!=', valueType: 'number' },
      ]);
    }

    if (types.includes('date-time')) {
      result = result.concat([
        { label: 'Equals', operatorValue: '=', valueType: 'date-time' },
        { label: '>', operatorValue: '>', valueType: 'date-time' },
        { label: '>=', operatorValue: '>=', valueType: 'date-time' },
        { label: '<', operatorValue: '<', valueType: 'date-time' },
        { label: '<=', operatorValue: '<=', valueType: 'date-time' },
        { label: 'Is not', operatorValue: '!=', valueType: 'date-time' },
      ]);
    }

    if (types.includes('boolean')) {
      result = result.concat([
        { label: 'Is True / False', operatorValue: '=', valueType: 'boolean' },
      ]);
    }

    if (types.includes('enum')) {
      const enumFields = colTypes.filter((type) => type.type === 'enum');
      for (const enumField of enumFields) {
        result = result.concat([
          { label: 'One of', operatorValue: 'in', valueType: 'Array<enum>', enum: enumField.enum },
          { label: 'Equals', operatorValue: '=', valueType: 'enum', enum: enumField.enum },
          { label: 'Is not', operatorValue: '!=', valueType: 'enum', enum: enumField.enum },
        ]);
      }
    }

    if (types.includes('null')) {
      result = result.concat([
        { label: 'Is Empty', operatorValue: '=', valueType: 'null' },
        { label: 'Is not Empty', operatorValue: '!=', valueType: 'null' },
      ]);
    }

    // Relationship fields (e.g. `user.company`) — string filters only
    if (currentColumn.field.includes('.')) {
      result = result.concat([
        { label: 'Contains', operatorValue: 'ilike', valueType: 'string' },
        { label: 'One of', operatorValue: 'in', valueType: 'Array<string>' },
        { label: 'Equals', operatorValue: '=', valueType: 'string' },
        { label: 'Is not', operatorValue: '!=', valueType: 'string' },
      ]);
    }

    // Disambiguate filters that share the same operator across multiple value types
    const duplicateOperatorFilters = result.filter((filter) => {
      return (
        ['string', 'integer', 'number', 'date-time', 'enum'].includes(filter.valueType) &&
        result.filter(
          (f) =>
            ['string', 'integer', 'number', 'date-time', 'enum'].includes(filter.valueType) &&
            f.operatorValue === filter.operatorValue,
        ).length > 1
      );
    });

    if (duplicateOperatorFilters.length > 0) {
      for (const filter of duplicateOperatorFilters) {
        let typeLabel = '';
        switch (filter.valueType) {
          case 'string':
            typeLabel = 'Text';
            break;
          case 'Array<string>':
            typeLabel = 'Texts';
            break;
          case 'number':
            typeLabel = 'Number';
            break;
          case 'Array<number>':
            typeLabel = 'Numbers';
            break;
          case 'date-time':
            typeLabel = 'Date';
            break;
          case 'enum':
            typeLabel = 'Option';
            break;
        }
        if (typeLabel) {
          filter.label = `${filter.label} (${typeLabel})`;
        }
      }
    }

    return result;
  }, [colTypes, currentColumn.field]);

  /**
   * Build and apply the filter from the current form state
   */
  function submitFilter(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFilter) return;

    let value: unknown = selectedValue;

    if (selectedFilter.valueType === 'boolean') {
      value = selectedValue === 'true';
    } else if (selectedFilter.valueType === 'Array<string>') {
      value = selectedValue.split(',');
    } else if (selectedFilter.valueType === 'Array<number>') {
      value = selectedValue.split(',').map((v) => Number(v));
    } else if (selectedFilter.valueType === 'Array<enum>') {
      value = selectedValue.split(',');
    } else if (selectedFilter.valueType === 'null') {
      value = null;
    }

    const filterToAdd: FilterCondition = {
      field: currentColumn.field,
      operator: selectedFilter.operatorValue,
      value,
    };

    setFilters([...filters, filterToAdd]);

    notify({
      message: t('Filter added.'),
      type: 'info',
    });
  }

  return (
    <GridColumnMenuContainer
      hideMenu={hideMenu}
      currentColumn={currentColumn}
      open={open}
      {...other}
    >
      <SortGridMenuItems onClick={hideMenu} column={currentColumn} />
      <HideGridColMenuItem onClick={hideMenu} column={currentColumn} />
      <GridColumnsMenuItem onClick={hideMenu} column={currentColumn} />

      {currentColumn.filterable && (
        <Popover width={450} position="right" withArrow radius="md" shadow="lg" zIndex={1400}>
          <Popover.Target>
            <MenuItem>Filter</MenuItem>
          </Popover.Target>
          <Popover.Dropdown onKeyDown={(e) => e.stopPropagation()}>
            <form className="flex text-sm gap-1 items-end" onSubmit={submitFilter}>
              <Select
                size="sm"
                placeholder="Operator"
                className="w-[160px]"
                data={availableFilters.map((f) => f.label)}
                value={selectedFilter?.label ?? null}
                onChange={(labelValue) => {
                  const filter = availableFilters.find((f) => f.label === labelValue);
                  setSelectedFilter(filter ?? null);
                  setSelectedValue('');
                }}
                comboboxProps={{ withinPortal: false }}
                required
                withAsterisk={false}
                withCheckIcon={false}
              />

              {!selectedFilter && <TextInput size="sm" placeholder="Value" disabled />}

              {selectedFilter?.label.startsWith('One of') ? (
                selectedFilter.valueType === 'Array<enum>' ? (
                  <MultiSelect
                    size="sm"
                    placeholder="Values"
                    className="w-[200px]"
                    data={selectedFilter.enum ?? []}
                    value={selectedValue !== '' ? selectedValue.split(',') : []}
                    onChange={(values) => setSelectedValue(values.join(','))}
                    comboboxProps={{ withinPortal: false }}
                  />
                ) : (
                  <TextInput
                    size="sm"
                    placeholder="Comma separated values"
                    value={selectedValue}
                    onChange={(e) => setSelectedValue(e.currentTarget.value)}
                    required
                    withAsterisk={false}
                  />
                )
              ) : (
                <>
                  {selectedFilter?.valueType === 'string' && (
                    <TextInput
                      size="sm"
                      placeholder="Value"
                      value={selectedValue}
                      onChange={(e) => setSelectedValue(e.currentTarget.value)}
                      required
                      withAsterisk={false}
                    />
                  )}

                  {['integer', 'number'].includes(selectedFilter?.valueType ?? '') && (
                    <NumberInput
                      size="sm"
                      placeholder="Value"
                      value={selectedValue}
                      onChange={(v) => setSelectedValue(String(v))}
                      required
                      withAsterisk={false}
                      hideControls
                    />
                  )}

                  {selectedFilter?.valueType === 'date-time' && (
                    <DateTimePickerInput
                      size="sm"
                      radius="md"
                      placeholder="Value"
                      className="w-[180px]"
                      value={selectedValue ? new Date(selectedValue) : null}
                      onChange={(v) => setSelectedValue(v ? new Date(v).toISOString() : '')}
                      required
                      withAsterisk={false}
                      valueFormat="DD MMM YYYY HH:mm"
                      popoverProps={{ withinPortal: false }}
                    />
                  )}

                  {selectedFilter?.valueType === 'boolean' && (
                    <RadioGroup
                      value={selectedValue}
                      onChange={setSelectedValue}
                      label="Value"
                      withAsterisk={false}
                      required
                    >
                      <div className="flex gap-1 p-2">
                        <Radio value="true" label="Is True" />
                        <Radio value="false" label="Is False" />
                      </div>
                    </RadioGroup>
                  )}

                  {selectedFilter?.valueType === 'enum' && (
                    <Select
                      size="sm"
                      placeholder="Value"
                      className="w-[160px]"
                      data={selectedFilter.enum ?? []}
                      value={selectedValue}
                      onChange={(v) => setSelectedValue(v ?? '')}
                      comboboxProps={{ withinPortal: false }}
                      required
                      withAsterisk={false}
                      withCheckIcon={false}
                    />
                  )}
                </>
              )}

              <Button size="sm" type="submit" radius="md" className="min-w-[40px] !px-0.5">
                <IconPlus size={16} />
              </Button>
            </form>
          </Popover.Dropdown>
        </Popover>
      )}
    </GridColumnMenuContainer>
  );
}
