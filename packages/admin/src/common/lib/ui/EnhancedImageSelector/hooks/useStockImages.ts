import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { useFetch } from '../../../hooks';
import type { User } from '../../../types';
import type { AttachmentFile } from '../../ChooseAttachmentModal';
import { STOCK_IMAGE_PROVIDERS } from '../constants/stockImages';

/**
 * Represents a single stock image from an external provider
 */
export interface StockImage {
  _id: string;
  _attachment?: AttachmentFile;
  provider_image_id: string;
  title: string;
  description?: string;
  src: string;
  preview_src: string;
  provider: string;
  photographer_name?: string;
  photographer_url?: string;
  download_location?: string;
}

interface StockImageSearchResponse {
  success: boolean;
  message: string;
  data: StockImage[];
}

/**
 * Configuration for the useStockImages hook
 */
export interface UseStockImagesConfig {
  backendHost: string;
  setUser: (user: User | null) => void;
}

/**
 * Custom hook for searching and paginating stock images from Unsplash
 */
export function useStockImages(config: UseStockImagesConfig) {
  const { backendHost, setUser } = config;

  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [images, setImages] = useState<StockImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOutOfData, setIsOutOfData] = useState(false);

  const prevSearchStrRef = useRef(searchQuery);

  const { post: fetchStockImages } = useFetch<unknown, StockImageSearchResponse>(
    'stock-image/search',
    { backendHost, setUser },
    { autoFetch: false },
  );

  const { post: postTrackDownload } = useFetch<unknown, { success: boolean }>(
    'stock-image/track-download',
    { backendHost, setUser },
    { autoFetch: false },
  );

  const searchImages = useCallback(
    (pageNum: number | null = null, queryOverride?: string) => {
      const effectiveQuery = queryOverride !== undefined ? queryOverride : searchQuery;
      if (prevSearchStrRef.current !== effectiveQuery) {
        prevSearchStrRef.current = effectiveQuery;
        setImages([]);
        setPage(1);
        setIsOutOfData(false);
      }
      setLoading(true);
      setError(null);
      void fetchStockImages({
        page: pageNum || 1,
        query_str: effectiveQuery,
        provider: STOCK_IMAGE_PROVIDERS.UNSPLASH,
      })
        .then((result) => {
          if (!result) return;
          if (result.success === false) {
            setError(result.message || 'Stock image search failed');
            return;
          }
          const { data } = result;
          if (data?.length) {
            setImages((prevState) => {
              const mappedData = data.map((item) => ({
                ...item,
                _id: uuidv4(),
              }));
              if (!pageNum || pageNum === 1) {
                return mappedData;
              }
              return [...(prevState || []), ...mappedData];
            });
          } else {
            setIsOutOfData(true);
          }
        })
        .catch((err) => {
          setError((err as Error).message ?? String(err));
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [fetchStockImages, searchQuery],
  );

  const loadMore = useCallback(() => {
    setPage((prev) => prev + 1);
    searchImages(page + 1, prevSearchStrRef.current);
  }, [page, searchImages]);

  const trackDownload = useCallback(
    (downloadLocation?: string) => {
      if (!downloadLocation) return;
      void postTrackDownload({ download_location: downloadLocation }).catch((err) => {
        console.warn('Unsplash download tracking failed:', err);
      });
    },
    [postTrackDownload],
  );

  return {
    prevSearchStrRef,
    searchQuery,
    setSearchQuery,
    images,
    setImages,
    loading,
    error,
    searchImages,
    loadMore,
    isOutOfData,
    trackDownload,
  };
}
