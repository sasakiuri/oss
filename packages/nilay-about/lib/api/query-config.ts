/**
 * TanStack Query configuration utilities
 *
 * Centralized query configuration for consistent caching and retry behavior
 */

export const queryConfig = {
  staleTime: {
    short: 1 * 60 * 1000, // 1 minute
    medium: 5 * 60 * 1000, // 5 minutes
    long: 30 * 60 * 1000, // 30 minutes
    infinite: Infinity,
  },
  gcTime: {
    short: 5 * 60 * 1000, // 5 minutes
    medium: 10 * 60 * 1000, // 10 minutes
    long: 60 * 60 * 1000, // 1 hour
  },
  retry: {
    default: 3,
    none: 0,
    once: 1,
  },
} as const;

/**
 * Default query options for different data types
 */
export const defaultQueryOptions = {
  news: {
    staleTime: queryConfig.staleTime.medium,
    gcTime: queryConfig.gcTime.medium,
    retry: queryConfig.retry.default,
  },
  static: {
    staleTime: queryConfig.staleTime.long,
    gcTime: queryConfig.gcTime.long,
    retry: queryConfig.retry.default,
  },
  realtime: {
    staleTime: queryConfig.staleTime.short,
    gcTime: queryConfig.gcTime.short,
    retry: queryConfig.retry.once,
  },
} as const;

/**
 * Mutation retry configuration
 */
export const mutationConfig = {
  contact: {
    retry: queryConfig.retry.once,
  },
} as const;
