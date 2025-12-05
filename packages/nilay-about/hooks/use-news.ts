"use client";

import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { fetchNewsList, fetchNewsById } from "@/lib/api/news";
import { defaultQueryOptions } from "@/lib/api/query-config";
import type { NewsListResponse, NewsGetResponse, News } from "@/lib/schemas";
import { useCallback } from "react";

// Query keys as constants for consistency and type safety
export const newsKeys = {
  all: ["news"] as const,
  lists: () => [...newsKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...newsKeys.lists(), filters] as const,
  details: () => [...newsKeys.all, "detail"] as const,
  detail: (id: string) => [...newsKeys.details(), id] as const,
};

type NewsListOptions = Omit<
  UseQueryOptions<NewsListResponse, Error>,
  "queryKey" | "queryFn"
>;

/**
 * Hook for fetching news list
 * Automatically populates individual news cache entries
 */
export function useNewsList(options?: NewsListOptions) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: newsKeys.lists(),
    queryFn: async () => {
      const result = await fetchNewsList();

      // Populate individual news cache entries
      result.newsList.forEach((news) => {
        queryClient.setQueryData(newsKeys.detail(news.id), { news });
      });

      return result;
    },
    ...defaultQueryOptions.news,
    ...options,
  });
}

type NewsDetailOptions = Omit<
  UseQueryOptions<NewsGetResponse, Error>,
  "queryKey" | "queryFn"
>;

/**
 * Hook for fetching single news item
 * Uses initialData from list cache if available
 */
export function useNews(id: string, options?: NewsDetailOptions) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: newsKeys.detail(id),
    queryFn: () => fetchNewsById(id),
    enabled: !!id,
    initialData: () => {
      // Try to get initial data from list cache
      const listData = queryClient.getQueryData<NewsListResponse>(newsKeys.lists());
      const news = listData?.newsList.find((n) => n.id === id);
      return news ? { news } : undefined;
    },
    ...defaultQueryOptions.news,
    ...options,
  });
}

/**
 * Hook for prefetching news data
 * Useful for prefetching on hover or route preparation
 */
export function usePrefetchNews() {
  const queryClient = useQueryClient();

  const prefetchNews = useCallback(
    async (id: string) => {
      await queryClient.prefetchQuery({
        queryKey: newsKeys.detail(id),
        queryFn: () => fetchNewsById(id),
        ...defaultQueryOptions.news,
      });
    },
    [queryClient]
  );

  const prefetchNewsList = useCallback(async () => {
    await queryClient.prefetchQuery({
      queryKey: newsKeys.lists(),
      queryFn: fetchNewsList,
      ...defaultQueryOptions.news,
    });
  }, [queryClient]);

  return { prefetchNews, prefetchNewsList };
}

/**
 * Hook for invalidating news cache
 */
export function useInvalidateNews() {
  const queryClient = useQueryClient();

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: newsKeys.all });
  }, [queryClient]);

  const invalidateList = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: newsKeys.lists() });
  }, [queryClient]);

  const invalidateDetail = useCallback(
    async (id: string) => {
      await queryClient.invalidateQueries({ queryKey: newsKeys.detail(id) });
    },
    [queryClient]
  );

  return { invalidateAll, invalidateList, invalidateDetail };
}
