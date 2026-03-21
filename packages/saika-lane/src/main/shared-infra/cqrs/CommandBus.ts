// SPDX-License-Identifier: MIT
/**
 * Type-safe CommandBus
 *
 * Guarantees type safety via token-based dispatch.
 */

import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/** Token for type-safe command dispatch */
export interface CommandToken<TInput, TOutput = void> {
  readonly name: string;
  /** @internal phantom type */
  readonly _input: TInput;
  /** @internal phantom type */
  readonly _output: TOutput;
}

/** Define a command token */
export function defineCommand<TInput, TOutput = void>(name: string): CommandToken<TInput, TOutput> {
  return { name } as CommandToken<TInput, TOutput>;
}

export type CommandHandler<T, R = void> = (command: T) => Promise<R>;

export interface CommandMiddleware {
  execute<R>(name: string, cmd: unknown, next: () => Promise<R>): Promise<R>;
}

export class CommandBus {
  private handlers = new Map<string, CommandHandler<unknown, unknown>>();
  private middlewares: CommandMiddleware[] = [];

  use(middleware: CommandMiddleware): void {
    this.middlewares.push(middleware);
  }

  register<TInput, TOutput>(token: CommandToken<TInput, TOutput>, handler: CommandHandler<TInput, TOutput>): void {
    const name = token.name;
    if (this.handlers.has(name)) {
      const logger = getLogger();
      logger.error(`Duplicate command handler registration: "${name}"`);
      throw ErrorCatalog.createError('COMMAND_DUPLICATE_HANDLER', {
        detail: `Duplicate command handler registration: "${name}"`,
      });
    }
    this.handlers.set(name, handler as CommandHandler<unknown, unknown>);
  }

  async execute<TInput, TOutput>(token: CommandToken<TInput, TOutput>, command: TInput): Promise<TOutput> {
    const name = token.name;
    const handler = this.handlers.get(name);
    if (!handler) {
      throw ErrorCatalog.createError('COMMAND_HANDLER_NOT_FOUND', {
        detail: `No handler registered for command: ${name}`,
      });
    }

    const chain = this.middlewares.reduceRight<() => Promise<unknown>>(
      (next, mw) => () => mw.execute(name, command, next),
      () => handler(command),
    );

    return chain() as Promise<TOutput>;
  }
}
