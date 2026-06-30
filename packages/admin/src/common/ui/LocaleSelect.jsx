import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Combobox, Input, InputBase, ScrollArea, useCombobox } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import clsx from 'clsx';
import { getFlagUrl } from '@deepsel/cms-utils/flags';

/**
 * Single-select for locale options that shows an SVG flag inside both the
 * selected-value display and each dropdown list item.
 *
 * Drop-in replacement for Mantine's Select when each item has an `iso_code`
 * field — Mantine's built-in Select has no prop to render custom content in
 * the selected-value input area.
 *
 * @param {{ data: Array<{value: string, label: string, iso_code: string}>, value: string, onChange: (value: string | null) => void, label?: string, description?: string, placeholder?: string, required?: boolean, clearable?: boolean, size?: string, radius?: string, className?: string }} props
 */
export function LocaleSelect({
  data,
  value,
  onChange,
  label,
  description,
  placeholder,
  required,
  clearable = false,
  size,
  radius,
  className,
}) {
  const { t } = useTranslation();
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const [search, setSearch] = useState('');

  const selectedItem = data.find((item) => item.value === value) ?? null;

  const filteredData = search.trim()
    ? data.filter((item) => item.label.toLowerCase().includes(search.toLowerCase()))
    : data;

  const handleSelect = (val) => {
    onChange(val);
    combobox.closeDropdown();
    setSearch('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange(null);
  };

  const rightSection =
    clearable && selectedItem ? (
      <IconX
        size={14}
        className="cursor-pointer text-gray-400 hover:text-gray-600"
        onClick={handleClear}
      />
    ) : (
      <Combobox.Chevron />
    );

  return (
    <Input.Wrapper
      label={label}
      description={description}
      required={required}
      className={className}
    >
      <Combobox store={combobox} onOptionSubmit={handleSelect}>
        <Combobox.Target>
          <InputBase
            component="button"
            type="button"
            size={size}
            radius={radius}
            pointer
            rightSection={rightSection}
            rightSectionPointerEvents={clearable && selectedItem ? 'all' : 'none'}
            onClick={() => combobox.toggleDropdown()}
          >
            {selectedItem ? (
              <span className="flex items-center gap-2">
                <img
                  src={getFlagUrl(selectedItem.iso_code ?? '')}
                  alt=""
                  className="h-4 w-auto object-contain shrink-0"
                />
                <span>{selectedItem.label}</span>
              </span>
            ) : (
              <Input.Placeholder>{placeholder}</Input.Placeholder>
            )}
          </InputBase>
        </Combobox.Target>

        <Combobox.Dropdown>
          <Combobox.Search
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder={t('Search...')}
          />
          <Combobox.Options>
            <ScrollArea.Autosize mah={220} type="scroll">
              {filteredData.length > 0 ? (
                filteredData.map((item) => (
                  <Combobox.Option
                    value={item.value}
                    key={item.value}
                    active={item.value === value}
                  >
                    <div className="flex items-center gap-2">
                      <IconCheck
                        size={12}
                        className={clsx(
                          'shrink-0',
                          item.value === value ? 'opacity-100' : 'opacity-0',
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
