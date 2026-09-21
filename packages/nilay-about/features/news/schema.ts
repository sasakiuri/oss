import { z } from 'zod';

export const newsSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.coerce.date(),
  summary: z.string(),
});

export type News = z.infer<typeof newsSchema>;

export const newsListResponseSchema = z.object({
  newsList: z.array(newsSchema),
});

export type NewsListResponse = z.infer<typeof newsListResponseSchema>;

export const newsGetResponseSchema = z.object({
  news: newsSchema,
});

export type NewsGetResponse = z.infer<typeof newsGetResponseSchema>;

export const newsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
});
export type NewsQuery = z.infer<typeof newsQuerySchema>;
