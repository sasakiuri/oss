import 'server-only';

import { getPrisma } from '@/lib/prisma';

import { newsSchema, type News, type NewsQuery } from '../schema';

export interface NewsRepository {
  list(query: NewsQuery): Promise<News[]>;
  find(id: string): Promise<News | null>;
}

const select = { id: true, title: true, date: true, summary: true } as const;

export const newsRepository: NewsRepository = {
  async list({ limit, offset }) {
    const rows = await getPrisma().news.findMany({
      select,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: offset,
    });
    return newsSchema.array().parse(rows);
  },
  async find(id) {
    const row = await getPrisma().news.findUnique({ where: { id }, select });
    return row ? newsSchema.parse(row) : null;
  },
};
