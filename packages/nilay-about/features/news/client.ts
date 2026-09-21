import { requestJson } from '@/lib/http/client';

import { newsGetResponseSchema, newsListResponseSchema } from './schema';

export function fetchNewsList(signal?: AbortSignal) {
  return requestJson('/api/news', newsListResponseSchema, { signal });
}

export function fetchNewsById(id: string, signal?: AbortSignal) {
  return requestJson(`/api/news/${encodeURIComponent(id)}`, newsGetResponseSchema, { signal });
}
