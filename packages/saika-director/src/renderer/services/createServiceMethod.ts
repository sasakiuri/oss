import type { Logger } from '@/shared/utils/Logger';

export function createServiceMethod<TArgs extends unknown[], TResult>(
  logger: Logger,
  actionName: string,
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      logger.logError(`${actionName} failed`, error, { action: actionName });
      throw error;
    }
  };
}
