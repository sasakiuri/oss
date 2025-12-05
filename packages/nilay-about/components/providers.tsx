"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { queryConfig } from "@/lib/api/query-config";
import { isProduction } from "@/lib/env";

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
