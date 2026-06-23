import React, { useEffect, useRef, useState } from 'react';
import { TextInput, type TextInputProps } from '@mantine/core';
import { IconX } from '@tabler/icons-react';

interface DebounceInputProps extends Omit<TextInputProps, 'value' | 'onChange'> {
  value?: string;
  onChange?: (value: string) => void;
  /**
   * If true, the input value syncs with parent value changes.
   * If false (default), only updates local value after debounce delay.
   */
  twoWayBinding?: boolean;
  /** Debounce delay in milliseconds */
  ms?: number;
  /** Render a native input instead of Mantine's TextInput */
  native?: boolean;
  /** Show a clear button on the right side */
  clearable?: boolean;
}

/**
 * DebounceInput - text input that debounces onChange calls to reduce update frequency
 */
export const DebounceInput = ({
  value,
  onChange,
  twoWayBinding = false,
  ms = 300,
  native = false,
  clearable = false,
  ...others
}: DebounceInputProps) => {
  const [localValue, setLocalValue] = useState(value);
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstChange = useRef(false);

  useEffect(() => {
    if (!isFirstChange.current || twoWayBinding) {
      setLocalValue(value);
    }
  }, [value, twoWayBinding]);

  useEffect(() => {
    if (!isFirstChange.current) {
      return;
    }
    if (timeoutId.current) {
      clearTimeout(timeoutId.current);
    }
    timeoutId.current = setTimeout(() => {
      onChange?.(localValue ?? '');
    }, ms);

    return () => {
      if (timeoutId.current) clearTimeout(timeoutId.current);
    };
  }, [localValue]);

  const inputProps = {
    value: localValue,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      isFirstChange.current = true;
      setLocalValue(e.target.value);
    },
  };

  if (native) {
    return <input {...inputProps} {...(others as React.InputHTMLAttributes<HTMLInputElement>)} />;
  }

  return (
    <TextInput
      {...inputProps}
      {...others}
      rightSection={
        clearable && (
          <IconX
            size={24}
            className="cursor-pointer hover:bg-gray-200 rounded-full p-1"
            onClick={() => {
              isFirstChange.current = true;
              setLocalValue('');
              onChange?.('');
            }}
          />
        )
      }
    />
  );
};
