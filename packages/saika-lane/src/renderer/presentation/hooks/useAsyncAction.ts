// SPDX-License-Identifier: MIT
import { useCallback, useRef, useState } from 'react';

export interface UseAsyncActionResult<TArgs extends unknown[], TResult> {
  execute: (...args: TArgs) => Promise<TResult>;
  loading: boolean;
  error: Error | null;
  clearError: () => void;
}

/**
 * Hook that centralizes the try/catch/finally + loading + error pattern for async actions
 *
 * @param fn The async function to execute
 * @param options.errorMessage Fallback message on error
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options?: { errorMessage?: string },
): UseAsyncActionResult<TArgs, TResult> {
  const activeCount = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const execute = useCallback(
    async (...args: TArgs): Promise<TResult> => {
      activeCount.current += 1;
      setLoading(true);
      setError(null);
      try {
        return await fnRef.current(...args);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(options?.errorMessage ?? 'An error occurred');
        setError(e);
        throw e;
      } finally {
        activeCount.current -= 1;
        if (activeCount.current === 0) {
          setLoading(false);
        }
      }
    },
    [options?.errorMessage],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { execute, loading, error, clearError };
}
