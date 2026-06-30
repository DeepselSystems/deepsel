import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Combobox, Input, Pill, PillsInput, ScrollArea, useCombobox } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import clsx from 'clsx';
import { getFlagUrl } from '@deepsel/cms-utils/flags';

/**
 * Multi-select for locale options that shows SVG flags inside both dropdown
 * list items and the selected-value pills.
 *
 * Drop-in replacement for Mantine's MultiSelect when each item has an `iso_code`
 * field — Mantine's built-in MultiSelect has no renderPill prop.
 *
 * @param {{ data: Array<{value: string, label: string, iso_code: string}>, value: string[], onChange: (values: string[]) => void, label?: string, description?: string, placeholder?: string, required?: boolean, size?: string, radius?: string, className?: string }} props
 */
export function LocaleMultiSelect({
  data,
  value,
  onChange,
  label,
  description,
  placeholder,
  required,
  size,
  radius,
  className,
}) {
  const { t } = useTranslation();
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const [search, setSearch] = useState('');

  const filteredData = search.trim()
    ? data.filter((item) => item.label.toLowerCase().includes(search.toLowerCase()))
    : data;

  const handleSelect = (val) =>
    onChange(value.includes(val) ? value.filter((v) => v !== val) : [...value, val]);

  const handleRemove = (val) => onChange(value.filter((v) => v !== val));

  const selectedItems = data.filter((item) => value.includes(item.value));

  return (
    <Input.Wrapper
      label={label}
      description={description}
      required={required}
      className={className}
    >
      <Combobox store={combobox} onOptionSubmit={handleSelect}>
        <Combobox.DropdownTarget>
          <PillsInput size={size} radius={radius} pointer onClick={() => combobox.toggleDropdown()}>
            <Pill.Group>
              {selectedItems.map((item) => (
                <Pill
                  key={item.value}
                  withRemoveButton
                  onRemove={() => handleRemove(item.value)}
                  classNames={{ label: 'overflow-visible mr-6' }}
                >
                  <span className="flex items-center gap-1">
                    <img
                      src={getFlagUrl(item.iso_code ?? '')}
                      alt=""
                      className="h-3 w-auto object-contain shrink-0"
                    />
                    <span>{item.label}</span>
                  </span>
                </Pill>
              ))}
              <Combobox.EventsTarget>
                <PillsInput.Field
                  onFocus={() => combobox.openDropdown()}
                  onBlur={() => combobox.closeDropdown()}
                  value={search}
                  placeholder={value.length === 0 ? placeholder : ''}
                  onChange={(e) => {
                    combobox.updateSelectedOptionIndex();
                    setSearch(e.currentTarget.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && search.length === 0 && value.length > 0) {
                      e.preventDefault();
                      handleRemove(value[value.length - 1]);
                    }
                  }}
                />
              </Combobox.EventsTarget>
            </Pill.Group>
          </PillsInput>
        </Combobox.DropdownTarget>

        <Combobox.Dropdown>
          <Combobox.Options>
            <ScrollArea.Autosize mah={220} type="scroll">
              {filteredData.length > 0 ? (
                filteredData.map((item) => (
                  <Combobox.Option value={item.value} key={item.value}>
                    <div className="flex items-center gap-2">
                      <IconCheck
                        size={12}
                        className={clsx(
                          'shrink-0',
                          value.includes(item.value) ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <img
                        src={getFlagUrl(item.iso_code ?? '')}
                        alt=""
                        className="h-4 w-auto object-contain shrink-0"
                      />
                      <span>{item.label}</span>
                    </div>
                  </Combobox.Option>
                ))
              ) : (
                <Combobox.Empty>{t('Nothing found')}</Combobox.Empty>
              )}
            </ScrollArea.Autosize>
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </Input.Wrapper>
  );
}
