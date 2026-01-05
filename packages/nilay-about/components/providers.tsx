"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { queryConfig } from "@/lib/api/query-config";

// NOTE: lib/env.ts は server-only のため、クライアント側では直接 process.env を参照
const isProduction = process.env.NODE_ENV === "production";

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Create QueryClient with production-optimized settings
 */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: queryConfig.staleTime.medium,
        gcTime: queryConfig.gcTime.medium,
        retry: queryConfig.retry.default,
        refetchOnWindowFocus: isProduction,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: queryConfig.retry.once,
      },
    },
  });
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
