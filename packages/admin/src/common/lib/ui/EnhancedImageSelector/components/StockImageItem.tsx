import React, { memo } from 'react';
import { Box, Checkbox, Image } from '@mantine/core';

import type { StockImage } from '../hooks/useStockImages';
import { UNSPLASH_UTM } from '../constants/stockImages';

interface StockImageItemProps {
  withCheckbox?: boolean;
  stockImage: StockImage;
  onClick?: () => void;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * Renders a single stock image card with optional checkbox for multi-select
 */
export const StockImageItem = memo<StockImageItemProps>(function StockImageItem({
  withCheckbox = false,
  stockImage,
  onClick = () => {},
  checked = false,
  onCheckedChange,
}) {
  return (
    <>
      <Box className="relative rounded shadow-md overflow-hidden cursor-pointer group">
        <Image
          onClick={onClick}
          loading="lazy"
          className="w-full"
          fit="contain"
          src={stockImage.preview_src}
          alt={stockImage.title}
          title={stockImage.title}
        />
        {stockImage.photographer_name && (
          <Box className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[0.65rem] bg-gradient-to-t from-black/70 to-transparent text-white opacity-0 group-hover:opacity-100 transition-opacity">
            <a
              href={`${stockImage.photographer_url ?? ''}${UNSPLASH_UTM}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-white hover:underline"
            >
              {stockImage.photographer_name}
            </a>{' '}
            on{' '}
            <a
              href={`https://unsplash.com/${UNSPLASH_UTM}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-white hover:underline"
            >
              Unsplash
            </a>
          </Box>
        )}

        {withCheckbox && stockImage._attachment && (
          <Box className="absolute top-0 right-0 p-1">
            <Checkbox
              checked={checked}
              onChange={({ target: { checked } }) => {
                onCheckedChange?.(checked);
              }}
            />
          </Box>
        )}
      </Box>
    </>
  );
});

StockImageItem.displayName = 'StockImageItem';
