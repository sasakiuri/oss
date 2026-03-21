// SPDX-License-Identifier: MIT
/**
 * Type-safe QueryBus
 *
 * Guarantees type safety via token-based dispatch.
 */

import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/** Token for type-safe query dispatch */
export interface QueryToken<TInput, TOutput> {
  readonly name: string;
  /** @internal phantom type */
  readonly _input: TInput;
  /** @internal phantom type */
  readonly _output: TOutput;
}

/** Define a query token */
export function defineQuery<TInput, TOutput>(name: string): QueryToken<TInput, TOutput> {
  return { name } as QueryToken<TInput, TOutput>;
}

export type QueryHandler<T, R> = (query: T) => Promise<R>;

export interface QueryMiddleware {
  execute<R>(name: string, query: unknown, next: () => Promise<R>): Promise<R>;
}

export class QueryBus {
  private handlers = new Map<string, QueryHandler<unknown, unknown>>();
  private middlewares: QueryMiddleware[] = [];

  use(middleware: QueryMiddleware): void {
    this.middlewares.push(middleware);
  }

  register<TInput, TOutput>(token: QueryToken<TInput, TOutput>, handler: QueryHandler<TInput, TOutput>): void {
    const name = token.name;
    if (this.handlers.has(name)) {
      const logger = getLogger();
      logger.error(`Duplicate query handler registration: "${name}"`);
      throw ErrorCatalog.createError('QUERY_DUPLICATE_HANDLER', {
        detail: `Duplicate query handler registration: "${name}"`,
      });
    }
    this.handlers.set(name, handler as QueryHandler<unknown, unknown>);
  }

  async execute<TInput, TOutput>(token: QueryToken<TInput, TOutput>, query: TInput): Promise<TOutput> {
    const name = token.name;
    const handler = this.handlers.get(name);
    if (!handler) {
      throw ErrorCatalog.createError('QUERY_HANDLER_NOT_FOUND', { detail: `No handler registered for query: ${name}` });
    }

    const chain = this.middlewares.reduceRight<() => Promise<unknown>>(
      (next, mw) => () => mw.execute(name, query, next),
      () => handler(query),
    );

    return chain() as Promise<TOutput>;
  }
}
