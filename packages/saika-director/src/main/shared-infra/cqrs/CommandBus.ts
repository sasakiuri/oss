/**
 * Type-safe CommandBus.
 *
 * Token-based dispatch preserves type safety. Create tokens with defineCommand() and pass them to register/execute.
 */

import { Logger } from '@/shared/utils/Logger';

// --- Token-based dispatch ---

/** Token for type-safe command dispatch. */
export interface CommandToken<TInput, TOutput = void> {
  readonly name: string;
  /** @internal Phantom type; no runtime value exists. */
  readonly _input: TInput;
  /** @internal Phantom type; no runtime value exists. */
  readonly _output: TOutput;
}

/** Defines a command token. */
export function defineCommand<TInput, TOutput = void>(name: string): CommandToken<TInput, TOutput> {
  return { name } as CommandToken<TInput, TOutput>;
}

export type CommandHandler<T, R = void> = (command: T) => Promise<R>;

export interface CommandMiddleware {
  execute<R>(name: string, cmd: unknown, next: () => Promise<R>): Promise<R>;
}

const logger = Logger.create('CommandBus');

export class CommandBus {
  private handlers = new Map<string, CommandHandler<unknown, unknown>>();
  private middlewares: CommandMiddleware[] = [];

  use(middleware: CommandMiddleware): void {
    this.middlewares.push(middleware);
  }

  register<TInput, TOutput>(token: CommandToken<TInput, TOutput>, handler: CommandHandler<TInput, TOutput>): void {
    const name = token.name;
    if (this.handlers.has(name)) {
      logger.warn(`Command handler for "${name}" is already registered. Overwriting.`);
    }
    this.handlers.set(name, handler as CommandHandler<unknown, unknown>);
  }

  async execute<TInput, TOutput>(token: CommandToken<TInput, TOutput>, command: TInput): Promise<TOutput> {
    const name = token.name;
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`No handler registered for command: ${name}`);
    }

    const chain = this.middlewares.reduceRight<() => Promise<unknown>>(
      (next, mw) => () => mw.execute(name, command, next),
      () => handler(command),
    );

    return chain() as Promise<TOutput>;
  }
}
