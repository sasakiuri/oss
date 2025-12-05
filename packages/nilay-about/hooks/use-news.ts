"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchNewsList, fetchNewsById } from "@/lib/api/news";

export function useNewsList() {
  return useQuery({
    queryKey: ["news", "list"],
    queryFn: fetchNewsList,
  });
}

export function useNews(id: string) {
  return useQuery({
    queryKey: ["news", "detail", id],
    queryFn: () => fetchNewsById(id),
    enabled: !!id,
  });
}
