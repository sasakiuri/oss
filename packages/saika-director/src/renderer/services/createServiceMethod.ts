import type { Logger } from '@/shared/utils/Logger';

type MetadataBuilder<TArgs extends unknown[]> = (...args: TArgs) => Record<string, unknown>;

export function createServiceMethod<TArgs extends unknown[], TResult>(
  logger: Logger,
  actionName: string,
  fn: (...args: TArgs) => Promise<TResult>,
  metadata?: MetadataBuilder<TArgs>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const meta = { action: actionName, ...metadata?.(...args) };
      logger.logError(`${actionName} failed`, error, meta);
      throw error;
    }
  };
}
