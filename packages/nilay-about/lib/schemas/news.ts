import { z } from "zod";

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

export const newsGetRequestSchema = z.object({
  id: z.string(),
});

export type NewsGetRequest = z.infer<typeof newsGetRequestSchema>;

export const newsGetResponseSchema = z.object({
  news: newsSchema,
});

export type NewsGetResponse = z.infer<typeof newsGetResponseSchema>;
