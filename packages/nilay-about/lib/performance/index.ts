/**
 * Performance utilities
 *
 * Helpers for optimizing app performance
 */

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let lastTime = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastTime >= ms) {
      lastTime = now;
      fn(...args);
    }
  };
}

/**
 * Memoize function results
 */
export function memoize<T extends (...args: unknown[]) => unknown>(
  fn: T,
  getKey?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>();

  return ((...args: Parameters<T>) => {
    const key = getKey ? getKey(...args) : JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = fn(...args) as ReturnType<T>;
    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Lazy load a module
 */
export function lazyLoad<T>(
  factory: () => Promise<T>
): () => Promise<T> {
  let cached: T | undefined;
  let loading: Promise<T> | undefined;

  return async () => {
    if (cached !== undefined) {
      return cached;
    }

    if (loading) {
      return loading;
    }

    loading = factory().then((result) => {
      cached = result;
      loading = undefined;
      return result;
    });

    return loading;
  };
}

/**
 * Measure execution time
 */
export async function measureTime<T>(
  fn: () => Promise<T>,
  label?: string
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;

  if (label && process.env.NODE_ENV === "development") {
    console.log(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
  }

  return { result, duration };
}

/**
 * Batch multiple calls into a single call
 */
export function createBatcher<TInput, TOutput>(
  batchFn: (inputs: TInput[]) => Promise<TOutput[]>,
  options: { maxBatchSize?: number; maxWaitMs?: number } = {}
) {
  const { maxBatchSize = 10, maxWaitMs = 10 } = options;

  let batch: { input: TInput; resolve: (output: TOutput) => void; reject: (error: unknown) => void }[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    if (batch.length === 0) return;

    const currentBatch = batch;
    batch = [];
    timeoutId = null;

    try {
      const inputs = currentBatch.map((item) => item.input);
      const outputs = await batchFn(inputs);

      currentBatch.forEach((item, index) => {
        item.resolve(outputs[index]);
      });
    } catch (error) {
      currentBatch.forEach((item) => {
        item.reject(error);
      });
    }
  };

  return (input: TInput): Promise<TOutput> => {
    return new Promise((resolve, reject) => {
      batch.push({ input, resolve, reject });

      if (batch.length >= maxBatchSize) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        flush();
      } else if (!timeoutId) {
        timeoutId = setTimeout(flush, maxWaitMs);
      }
    });
  };
}
