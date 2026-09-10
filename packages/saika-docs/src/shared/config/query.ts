// SPDX-License-Identifier: MIT
import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '../api/http';

export const cachePolicy = {
  catalog: 5 * 60_000,
  content: 300,
  public: 'public, max-age=0, s-maxage=300, stale-while-revalidate=60',
  private: 'private, no-store',
} as const;
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: cachePolicy.catalog,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status < 500),
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      },
      mutations: { retry: false },
    },
  });
}
