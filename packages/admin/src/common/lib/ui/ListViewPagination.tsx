import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pagination } from '@mantine/core';
import clsx from 'clsx';

interface ListViewQuery {
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  total: number;
}

interface ListViewPaginationProps {
  query: ListViewQuery;
  className?: string;
}

/**
 * Pagination bar for list views with record range display
 */
export const ListViewPagination = ({ query, className }: ListViewPaginationProps) => {
  const { t } = useTranslation();
  const { page, setPage, pageSize, total } = query;

  const recRange = {
    start: Math.min((page - 1) * pageSize + 1, total),
    end: Math.min(page * pageSize, total),
  };

  /** Total number of pages */
  const totalPages = total % pageSize === 0 ? total / pageSize : Math.floor(total / pageSize) + 1;

  return (
    <div className={clsx('flex w-full justify-between items-center mt-3', className)}>
      <div className="text-sm pl-2">
        {recRange.start} to {recRange.end} {t('of')} {total} {t('records')}
      </div>
      <Pagination value={page} onChange={setPage} total={totalPages} color="primary" />
    </div>
  );
};
