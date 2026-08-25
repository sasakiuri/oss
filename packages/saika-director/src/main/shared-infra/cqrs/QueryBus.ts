/**
 * Type-safe QueryBus.
 *
 * Token-based dispatch preserves type safety. Create tokens with defineQuery() and pass them to register/execute.
 */

import { Logger } from '@/shared/utils/Logger';

// --- Token-based dispatch ---

/** Token for type-safe query dispatch. */
export interface QueryToken<TInput, TOutput> {
  readonly name: string;
  /** @internal Phantom type; no runtime value exists. */
  readonly _input: TInput;
  /** @internal Phantom type; no runtime value exists. */
  readonly _output: TOutput;
}

/** Defines a query token. */
export function defineQuery<TInput, TOutput>(name: string): QueryToken<TInput, TOutput> {
  return { name } as QueryToken<TInput, TOutput>;
}

export type QueryHandler<T, R> = (query: T) => Promise<R>;

export interface QueryMiddleware {
  execute<R>(name: string, query: unknown, next: () => Promise<R>): Promise<R>;
}

const logger = Logger.create('QueryBus');

export class QueryBus {
  private handlers = new Map<string, QueryHandler<unknown, unknown>>();
  private middlewares: QueryMiddleware[] = [];

  use(middleware: QueryMiddleware): void {
    this.middlewares.push(middleware);
  }

  register<TInput, TOutput>(token: QueryToken<TInput, TOutput>, handler: QueryHandler<TInput, TOutput>): void {
    const name = token.name;
    if (this.handlers.has(name)) {
      logger.warn(`Query handler for "${name}" is already registered. Overwriting.`);
    }
    this.handlers.set(name, handler as QueryHandler<unknown, unknown>);
  }

  async execute<TInput, TOutput>(token: QueryToken<TInput, TOutput>, query: TInput): Promise<TOutput> {
    const name = token.name;
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`No handler registered for query: ${name}`);
    }

    const chain = this.middlewares.reduceRight<() => Promise<unknown>>(
      (next, mw) => () => mw.execute(name, query, next),
      () => handler(query),
    );

    return chain() as Promise<TOutput>;
  }
}
