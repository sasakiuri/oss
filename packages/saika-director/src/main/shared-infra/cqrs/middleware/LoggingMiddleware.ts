/**
 * CQRS logging middleware.
 *
 * Logs command/query start, completion, and failure.
 */

import type { CommandMiddleware } from '../CommandBus';
import type { QueryMiddleware } from '../QueryBus';
import { Logger } from '@/shared/utils/Logger';

const logger = Logger.create('CQRS');

export class CommandLoggingMiddleware implements CommandMiddleware {
  async execute<R>(name: string, _cmd: unknown, next: () => Promise<R>): Promise<R> {
    const start = performance.now();
    logger.debug(`[Command:${name}] start`);
    try {
      const result = await next();
      logger.debug(`[Command:${name}] done (${(performance.now() - start).toFixed(1)}ms)`);
      return result;
    } catch (err) {
      logger.logError(`[Command:${name}] failed`, err);
      throw err;
    }
  }
}

export class QueryLoggingMiddleware implements QueryMiddleware {
  async execute<R>(name: string, _query: unknown, next: () => Promise<R>): Promise<R> {
    const start = performance.now();
    logger.debug(`[Query:${name}] start`);
    try {
      const result = await next();
      logger.debug(`[Query:${name}] done (${(performance.now() - start).toFixed(1)}ms)`);
      return result;
    } catch (err) {
      logger.logError(`[Query:${name}] failed`, err);
      throw err;
    }
  }
}
