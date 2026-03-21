// SPDX-License-Identifier: MIT
/**
 * CQRS logging middleware
 *
 * Logs the start, completion, and failure of command/query execution.
 */

import { getLogger } from '@/main/shared-infra/logging/createLogger';

import type { CommandMiddleware } from '../CommandBus';
import type { QueryMiddleware } from '../QueryBus';

export class CommandLoggingMiddleware implements CommandMiddleware {
  async execute<R>(name: string, _cmd: unknown, next: () => Promise<R>): Promise<R> {
    const logger = getLogger();
    const start = performance.now();
    logger.debug(`[Command:${name}] start`, 'cqrs');
    try {
      const result = await next();
      logger.debug(`[Command:${name}] done (${(performance.now() - start).toFixed(1)}ms)`, 'cqrs');
      return result;
    } catch (err) {
      logger.error(
        `[Command:${name}] failed`,
        'cqrs',
        err instanceof Error ? { error: err.stack } : { error: String(err) },
      );
      throw err;
    }
  }
}

export class QueryLoggingMiddleware implements QueryMiddleware {
  async execute<R>(name: string, _query: unknown, next: () => Promise<R>): Promise<R> {
    const logger = getLogger();
    const start = performance.now();
    logger.debug(`[Query:${name}] start`, 'cqrs');
    try {
      const result = await next();
      logger.debug(`[Query:${name}] done (${(performance.now() - start).toFixed(1)}ms)`, 'cqrs');
      return result;
    } catch (err) {
      logger.error(
        `[Query:${name}] failed`,
        'cqrs',
        err instanceof Error ? { error: err.stack } : { error: String(err) },
      );
      throw err;
    }
  }
}
