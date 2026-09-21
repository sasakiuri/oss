import { queryOptions } from '@tanstack/react-query';

import { fetchNewsById, fetchNewsList } from './client';

export const newsQueries = {
  list: () =>
    queryOptions({
      queryKey: ['news', 'list'] as const,
      queryFn: ({ signal }) => fetchNewsList(signal),
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: ['news', 'detail', id] as const,
      queryFn: ({ signal }) => fetchNewsById(id, signal),
      enabled: Boolean(id),
    }),
};
