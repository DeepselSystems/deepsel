import { useMemo, useState } from 'react';
import { Image, Tooltip } from '@mantine/core';
import clsx from 'clsx';
import { getFlagUrlForIsoCode } from '../utils/localeFlag.js';
import { FALLBACK_FLAG_CODE, FLAG_HEIGHT_PX } from '../../constants/attachment.js';

/**
 * @typedef LocaleFlagProps
 * @property {import('../../../../typedefs/AttachmentFile.js').LocaleInfo|null} locale - Locale info; null renders a "no language" fallback flag
 * @property {boolean} selected - Whether this flag is the currently active locale
 * @property {(e: React.MouseEvent) => void} onClick
 * @property {number} [size] - Flag height in pixels; defaults to FLAG_HEIGHT_PX
 * @property {boolean} [noFile] - True when no locale_version exists for this language yet (visual hint only, still clickable)
 */

/**
 * Renders a single SVG country flag as a clickable chip with a locale-name tooltip.
 *
 * States:
 *   - selected: highlighted border + ring (currently previewed locale)
 *   - noFile: grayed out (language configured but no file uploaded yet) — still clickable
 *   - default: hover border on mouse-over
 *
 * Error handling: if the flag image 404s, falls back to FALLBACK_FLAG_CODE (UN flag)
 * once. The errored state prevents infinite retry loops.
 *
 * @param {LocaleFlagProps} props
 */
export function LocaleFlag({
  locale,
  selected,
  onClick,
  size = FLAG_HEIGHT_PX,
  noFile = false,
  className = '',
}) {
  // Track whether the flag image failed to load so we can swap to the fallback once.
  // Only used in SVG mode (no emoji_flag).
  const [errored, setErrored] = useState(false);
  const localeName = locale?.name ?? 'No language assigned';
  const isoCode = errored ? FALLBACK_FLAG_CODE : (locale?.iso_code ?? null);
  const flagUrl = getFlagUrlForIsoCode(isoCode);

  /** Swap to fallback SVG on load error; guard prevents infinite re-trigger. */
  const handleImgError = () => {
    if (!errored) setErrored(true);
  };
  const imgStyle = useMemo(() => ({ height: size }), [size]);

  return (
    <Tooltip keepMounted label={localeName} zIndex={11000} withArrow>
      <button
        type="button"
        aria-label={
          noFile ? `${localeName}: no file uploaded yet` : `Switch to ${localeName} version`
        }
        aria-pressed={selected}
        onClick={onClick}
        className={clsx(
          'transition-all cursor-pointer flex items-center justify-center p-0.5 border rounded',
          // Dim when no file and not currently selected
          selected
            ? 'opacity-100 border-gray-main'
            : 'opacity-40 border-transparent hover:border-gray-westar',
          className,
        )}
      >
        <Image
          loading="lazy"
          src={flagUrl}
          alt={localeName}
          className="block w-auto pointer-events-none"
          style={imgStyle}
          onError={handleImgError}
        />
      </button>
    </Tooltip>
  );
}
