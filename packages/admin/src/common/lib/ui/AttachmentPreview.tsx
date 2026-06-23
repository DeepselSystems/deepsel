import React from 'react';
import { AspectRatio, Box, Image, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { getAttachmentRelativeUrl, formatFileSize } from '@deepsel/cms-utils';
import { IconFile, IconFileOff } from '@tabler/icons-react';
import type { AttachmentFile, AttachmentLocaleVersion } from './ChooseAttachmentModal';
import { VersionFlagBar } from '../../ui/VersionFlagBar';

/**
 * Minimal locale language shape required by VersionFlagBar
 */
export interface OrgLanguage {
  id: number;
  name: string;
  iso_code?: string | null;
  emoji_flag?: string | null;
}

interface AttachmentPreviewProps {
  /** The parent attachment record */
  attachment: AttachmentFile;
  /**
   * Locale versions to render. Defaults to attachment.locale_versions when omitted.
   * Pass a managed local copy (e.g. from useSelectedVersion) to reflect in-session edits.
   */
  versions?: AttachmentLocaleVersion[];
  /** Currently previewed locale ID; null falls back to defaultLocaleId then first version */
  selectedLocaleId: number | null;
  /** Called when the user clicks a flag to switch locale */
  onSelectLocale: (localeId: number) => void;
  /** Site-level default locale ID — determines initial selection and flag sort order */
  defaultLocaleId: number | null;
  /** All org-configured languages forwarded to VersionFlagBar */
  availableLanguages: OrgLanguage[];
  /**
   * Optional overlay rendered on top of the preview (e.g. AttachmentCardOverlay).
   * The parent controls when to show it (hover state, etc.).
   */
  overlay?: React.ReactNode;
  /** Extra className applied to the AspectRatio element (e.g. selected border styles) */
  aspectRatioClassName?: string;
  /** If provided, renders this instead of the AspectRatio image area (e.g. a Skeleton placeholder for lazy loading) */
  imagePlaceholder?: React.ReactNode;
}

function resolveVersion(
  versions: AttachmentLocaleVersion[],
  selectedLocaleId: number | null,
  defaultLocaleId: number | null,
): AttachmentLocaleVersion | undefined {
  if (!versions.length) return undefined;
  const localeId = selectedLocaleId ?? defaultLocaleId;
  if (localeId != null) {
    return versions.find((v) => v.locale_id === localeId);
  } else {
    return versions[0];
  }
}

/**
 * Shared attachment preview block: AspectRatio image/file/placeholder + VersionFlagBar.
 *
 * Handles version resolution, lazy-load gating, and an optional overlay slot.
 * Used by both the Media grid (AttachmentCard) and the EnhancedImageSelector.
 */
export function AttachmentPreview({
  attachment,
  versions,
  selectedLocaleId,
  onSelectLocale,
  defaultLocaleId,
  availableLanguages,
  overlay,
  aspectRatioClassName,
  imagePlaceholder,
}: AttachmentPreviewProps) {
  const { t } = useTranslation();

  const resolvedVersions = versions ?? attachment.locale_versions ?? [];
  const selectedVersion = resolveVersion(resolvedVersions, selectedLocaleId, defaultLocaleId);
  const hasVersion = selectedVersion != null;
  const isImage = hasVersion && (selectedVersion.content_type?.startsWith('image') ?? false);

  const selectedLangName =
    availableLanguages.find((l) => l.id === selectedLocaleId)?.name ??
    selectedVersion?.locale?.name ??
    null;

  return (
    <Box>
      {imagePlaceholder != null ? (
        <Box>{imagePlaceholder}</Box>
      ) : (
        <Box>
          <AspectRatio
            ratio={1}
            mx="auto"
            className={clsx('relative overflow-hidden', overlay && 'group', aspectRatioClassName)}
          >
            {!hasVersion ? (
              <Box className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-gray-400 bg-gray-50">
                <IconFileOff size={32} />
                <span className="text-xs text-center px-2">
                  {selectedLangName
                    ? t('No file for {{lang}}', { lang: selectedLangName })
                    : t('No file for this language')}
                </span>
              </Box>
            ) : isImage ? (
              <Image
                loading="lazy"
                src={getAttachmentRelativeUrl(selectedVersion.name)}
                alt={selectedVersion.alt_text ?? ''}
              />
            ) : (
              <Box className="w-full h-full bg-gray-100 text-gray-500 flex flex-col items-center justify-center gap-3">
                <IconFile size={28} />
                <Text size="xs" className="text-center px-2 max-w-full">
                  {selectedVersion.name}
                </Text>
              </Box>
            )}
            {overlay && <Box className="hidden group-hover:block absolute inset-0">{overlay}</Box>}
          </AspectRatio>
        </Box>
      )}

      <Box onClick={(e) => e.stopPropagation()}>
        <VersionFlagBar
          versions={resolvedVersions}
          selectedLocaleId={selectedLocaleId ?? defaultLocaleId ?? null}
          onSelectLocale={onSelectLocale}
          defaultLocaleId={defaultLocaleId}
          availableLanguages={availableLanguages}
        />
      </Box>

      <Box className="p-2 text-sm">
        <Box className="font-medium break-words line-clamp-2" title={attachment.name ?? undefined}>
          {attachment.name}
        </Box>
        {hasVersion && (
          <>
            <Box className="break-words text-gray-500 line-clamp-2" title={selectedVersion!.name}>
              {selectedVersion!.name}
            </Box>
            <Box className="text-gray-500">{formatFileSize(selectedVersion!.filesize ?? 0)}</Box>
          </>
        )}
      </Box>
    </Box>
  );
}
