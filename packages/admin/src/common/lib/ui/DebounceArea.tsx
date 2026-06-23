import React, { useEffect, useRef, useState } from 'react';
import { Textarea, type TextareaProps } from '@mantine/core';

interface DebounceAreaProps extends Omit<TextareaProps, 'value' | 'onChange'> {
  value?: string;
  onChange?: (value: string) => void;
  /** Debounce delay in milliseconds */
  ms?: number;
  /** Render a native textarea instead of Mantine's Textarea */
  native?: boolean;
}

/**
 * DebounceArea - textarea that debounces onChange calls to reduce update frequency
 */
export const DebounceArea = ({
  value,
  onChange,
  ms = 300,
  native = false,
  ...others
}: DebounceAreaProps) => {
  const [localValue, setLocalValue] = useState(value);
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstChange = useRef(false);

  useEffect(() => {
    if (!isFirstChange.current) {
      setLocalValue(value);
    }
  }, [value]);

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

  /** Move cursor to end of text on focus */
  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const length = e.target.value.length;
    e.target.setSelectionRange(length, length);
  };

  const textareaProps = {
    value: localValue,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      isFirstChange.current = true;
      setLocalValue(e.target.value);
    },
    onFocus: handleFocus,
  };

  if (native) {
    return (
      <textarea
        {...textareaProps}
        {...(others as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
      />
    );
  }

  return <Textarea {...textareaProps} {...others} />;
};
