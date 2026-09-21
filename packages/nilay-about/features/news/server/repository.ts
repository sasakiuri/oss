import 'server-only';

import { z } from 'zod';

import { newsSchema, type News, type NewsQuery } from '../schema';

export interface NewsRepository {
  list(query: NewsQuery): Promise<News[]>;
  find(id: string): Promise<News | null>;
}

const configurationSchema = z.object({
  domain: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  apiKey: z.string().trim().min(1),
});
const listSchema = z.object({ contents: z.array(newsSchema) });
const fields = 'id,title,summary,date';

// Configuration is checked on requests so builds do not need CMS credentials.
async function request(path: string, parameters: Record<string, string>): Promise<Response> {
  const configuration = configurationSchema.safeParse({
    domain: process.env.MICROCMS_SERVICE_DOMAIN,
    apiKey: process.env.MICROCMS_API_KEY,
  });
  if (!configuration.success) throw new Error('microCMS configuration is missing or invalid');

  const { domain, apiKey } = configuration.data;
  const url = new URL(`https://${domain}.microcms.io/api/v1/news${path}`);
  url.search = new URLSearchParams({ fields, ...parameters }).toString();
  return fetch(url, {
    headers: { 'X-MICROCMS-API-KEY': apiKey },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
}

function requireSuccess(response: Response): void {
  // Upstream error bodies can contain private service details.
  if (!response.ok) throw new Error(`microCMS request failed (${response.status})`);
}

export const newsRepository: NewsRepository = {
  async list({ limit, offset }) {
    const response = await request('', {
      limit: String(limit),
      offset: String(offset),
      orders: '-date,-createdAt',
    });
    requireSuccess(response);
    return listSchema.parse(await response.json()).contents;
  },
  async find(id) {
    // microCMS content IDs use letters, digits, hyphens and underscores.
    // Reject path traversal and query syntax before constructing the upstream URL.
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
    const response = await request(`/${encodeURIComponent(id)}`, {});
    if (response.status === 404) return null;
    requireSuccess(response);
    const news = newsSchema.parse(await response.json());
    if (news.id !== id) throw new Error('microCMS returned an unexpected news ID');
    return news;
  },
};
