import { useMemo, useState } from 'react';
import { Indicator } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { getAttachmentByNameRelativeUrl, getFileNameFromAttachUrl } from '@deepsel/cms-utils';
import { ChooseAttachmentModal } from '../ChooseAttachmentModal';
import type { AttachmentFile } from '../ChooseAttachmentModal';
import type { User, Locale } from '../../types';
import { IconFile, IconFileText, IconPhoto, IconPlus, IconX } from '@tabler/icons-react';

/** File object passed to the onChange callback */
export type FileInputValue = AttachmentFile & { attachUrl: string };

export interface FileInputProps {
  /** Optional label rendered above the input */
  label?: string;

  /** Whether the input accepts images or generic files. Defaults to 'file' */
  type?: 'file' | 'image';

  /** Alt text for image preview. Defaults to 'Image' */
  alt?: string;

  /** Preview width in pixels. Defaults to 80 */
  width?: number;

  /** Preview height in pixels. Defaults to 80 */
  height?: number;

  /** Current attachment name (controlled) */
  value?: string;

  /** Called with the selected file object, or null when the file is removed */
  onChange?: (file: FileInputValue | null) => void;

  /** Additional filters passed to ChooseAttachmentModal */
  filters?: { field: string; operator: string; value: unknown }[];

  /** Whether to show recently used files in the modal. Defaults to true */
  showPastFiles?: boolean;

  /**
   * Placeholder image URL shown when no file is selected.
   * The origin defaulted to bundled icons; pass your own since this package
   * ships no static assets.
   */
  placeholder?: string;

  /**
   * Backend host URL.
   * Typically sourced from BackendHostURLState.
   */
  backendHost: string;

  /**
   * Locale object used to resolve the attachment version.
   * When omitted, the backend falls back to the org default locale.
   */
  locale?: Locale;

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
 * File/image picker input with inline preview and remove button.
 *
 * Requires backendHost, user, setUser props
 * (sourced from BackendHostURLState / UserState in the consuming app).
 */
export function FileInput({
  label = '',
  type = 'file',
  alt = 'Image',
  width = 80,
  height = 80,
  value,
  onChange,
  filters = [],
  showPastFiles = true,
  placeholder,
  backendHost,
  user,
  setUser,
  locale,
}: FileInputProps) {
  const [attachUrl, setAttachUrl] = useState(value || '');
  const [isOpen, { open, close }] = useDisclosure();
  const defaultPlaceholder = useMemo(
    () =>
      type === 'image' ? (
        <IconPhoto size={50} className="text-gray-300" />
      ) : (
        <IconFile size={50} className="text-gray-300" />
      ),
    [],
  );

  /**
   * Clear the current attachment and notify parent
   */
  function handleRemoveFile() {
    setAttachUrl('');
    if (onChange) {
      onChange(null);
    }
  }

  /**
   * Handle file selection from the attachment modal
   */
  function handleFileChange(file: FileInputValue) {
    setAttachUrl(file?.name ?? '');
    if (onChange) {
      onChange({
        ...file,
        attachUrl,
      });
    }
  }

  return (
    <div className="relative">
      {label && (
        <div
          style={{
            fontSize: 'var(--input-label-size,var(--mantine-font-size-sm))',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          {label}
        </div>
      )}

      {attachUrl ? (
        <Indicator
          onClick={handleRemoveFile}
          color="red"
          inline
          size={20}
          zIndex="auto"
          className="cursor-pointer"
          label={<IconX size={10} />}
        >
          {type === 'image' ? (
            <img
              onClick={(e) => {
                e.stopPropagation();
                open();
              }}
              src={getAttachmentByNameRelativeUrl(attachUrl, locale?.iso_code)}
              alt={alt}
              width={width}
              height={height}
              className="object-cover bg-gray-200 rounded-xl"
            />
          ) : (
            <a
              className="flex items-end text-primary-main"
              href={getAttachmentByNameRelativeUrl(attachUrl, locale?.iso_code)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <IconFileText style={{ width: `${width}px`, height: `${height}px` }} />
              <div className="ml-2 !underline">{getFileNameFromAttachUrl(attachUrl)}</div>
            </a>
          )}
        </Indicator>
      ) : (
        <Indicator
          onClick={open}
          inline
          size={20}
          zIndex="auto"
          className="cursor-pointer"
          label={<IconPlus size={10} />}
        >
          {type === 'image' ? (
            placeholder ? (
              <img
                src={placeholder}
                alt={alt}
                width={width}
                height={height}
                className="object-cover"
              />
            ) : (
              defaultPlaceholder
            )
          ) : (
            <IconFileText
              className="text-primary-main"
              style={{ width: `${width}px`, height: `${height}px` }}
            />
          )}
        </Indicator>
      )}

      <ChooseAttachmentModal
        isOpen={isOpen}
        close={close}
        onChange={handleFileChange}
        type={type}
        filters={filters}
        showPastFiles={showPastFiles}
        backendHost={backendHost}
        user={user}
        setUser={setUser}
      />
    </div>
  );
}
