// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { CommandHandler, CommandMiddleware, CommandToken } from '@/main/shared-infra/cqrs/CommandBus';
import { CommandBus, defineCommand } from '@/main/shared-infra/cqrs/CommandBus';

// Logger mock — kept as external variables so each test can reference them
const mockError = vi.fn();

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: mockError,
  }),
}));

// ---------- Type definitions for tests ----------

interface CreateUserInput {
  name: string;
  email: string;
}

interface CreateUserOutput {
  id: string;
  name: string;
}

interface DeleteUserInput {
  userId: string;
}

// ---------- Tests ----------

describe('CommandBus', () => {
  let bus: CommandBus;

  beforeEach(() => {
    bus = new CommandBus();
  });

  // ============================
  // defineCommand()
  // ============================
  describe('defineCommand()', () => {
    it('creates a token with the specified name', () => {
      const token = defineCommand<CreateUserInput>('CreateUser');
      expect(token.name).toBe('CreateUser');
    });

    it('creates different tokens for different names', () => {
      const token1 = defineCommand<CreateUserInput>('CreateUser');
      const token2 = defineCommand<DeleteUserInput>('DeleteUser');
      expect(token1.name).not.toBe(token2.name);
    });

    it('phantom types are correctly inferred (void output)', () => {
      const token = defineCommand<DeleteUserInput>('DeleteUser');
      expectTypeOf(token).toMatchTypeOf<CommandToken<DeleteUserInput, void>>();
    });

    it('phantom types are correctly inferred (non-void output)', () => {
      const token = defineCommand<CreateUserInput, CreateUserOutput>('CreateUser');
      expectTypeOf(token).toMatchTypeOf<CommandToken<CreateUserInput, CreateUserOutput>>();
    });
  });

  // ============================
  // register()
  // ============================
  describe('register()', () => {
    it('registers a handler', () => {
      const token = defineCommand<CreateUserInput>('CreateUser');
      const handler: CommandHandler<CreateUserInput> = vi.fn().mockResolvedValue(undefined);

      expect(() => {
        bus.register(token, handler);
      }).not.toThrow();
    });

    it('throws a COMMAND_DUPLICATE_HANDLER error when re-registering the same token', () => {
      const token = defineCommand<DeleteUserInput>('DeleteUser');

      const handler1: CommandHandler<DeleteUserInput> = vi.fn().mockResolvedValue(undefined);
      const handler2: CommandHandler<DeleteUserInput> = vi.fn().mockResolvedValue(undefined);

      bus.register(token, handler1);

      expect(() => bus.register(token, handler2)).toThrow('Duplicate command handler registration');
      expect(mockError).toHaveBeenCalledWith(expect.stringContaining('DeleteUser'));
    });
  });

  // ============================
  // execute()
  // ============================
  describe('execute()', () => {
    it('calls the registered handler with the correct input', async () => {
      const token = defineCommand<CreateUserInput>('CreateUser');
      const handler: CommandHandler<CreateUserInput> = vi.fn().mockResolvedValue(undefined);

      bus.register(token, handler);

      const input: CreateUserInput = {
        name: 'Taro',
        email: 'taro@example.com',
      };
      await bus.execute(token, input);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(input);
    });

    it('returns the handler return value (non-void output)', async () => {
      const token = defineCommand<CreateUserInput, CreateUserOutput>('CreateUser');
      const expectedOutput: CreateUserOutput = { id: 'u123', name: 'Taro' };
      const handler: CommandHandler<CreateUserInput, CreateUserOutput> = vi.fn().mockResolvedValue(expectedOutput);

      bus.register(token, handler);

      const result = await bus.execute(token, {
        name: 'Taro',
        email: 'taro@example.com',
      });

      expect(result).toEqual(expectedOutput);
    });

    it('throws an error when executing with an unregistered token', async () => {
      const token = defineCommand<DeleteUserInput>('UnregisteredCommand');

      await expect(bus.execute(token, { userId: 'u1' })).rejects.toThrow('Command handler not found');
    });

    it('propagates handler errors', async () => {
      const token = defineCommand<DeleteUserInput>('DeleteUser');
      const expectedError = new Error('Database connection lost');
      const handler: CommandHandler<DeleteUserInput> = vi.fn().mockRejectedValue(expectedError);

      bus.register(token, handler);

      await expect(bus.execute(token, { userId: 'u1' })).rejects.toThrow('Database connection lost');
    });

    it('can execute the same token multiple times', async () => {
      const token = defineCommand<DeleteUserInput>('DeleteUser');
      const handler: CommandHandler<DeleteUserInput> = vi.fn().mockResolvedValue(undefined);

      bus.register(token, handler);

      await bus.execute(token, { userId: 'u1' });
      await bus.execute(token, { userId: 'u2' });

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenNthCalledWith(1, { userId: 'u1' });
      expect(handler).toHaveBeenNthCalledWith(2, { userId: 'u2' });
    });
  });

  // ============================
  // Middleware
  // ============================
  describe('middleware', () => {
    it('middleware is executed during execute', async () => {
      const token = defineCommand<DeleteUserInput>('DeleteUser');
      const handler: CommandHandler<DeleteUserInput> = vi.fn().mockResolvedValue(undefined);
      bus.register(token, handler);

      const calls: Array<{ name: string; cmd: unknown }> = [];
      const middleware: CommandMiddleware = {
        execute: async <R>(name: string, cmd: unknown, next: () => Promise<R>) => {
          calls.push({ name, cmd });
          return next();
        },
      };
      bus.use(middleware);

      await bus.execute(token, { userId: 'u1' });

      expect(calls).toHaveLength(1);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('middleware chain executes in the correct order (first registered = outermost)', async () => {
      const token = defineCommand<DeleteUserInput>('DeleteUser');
      const order: string[] = [];

      const handler: CommandHandler<DeleteUserInput> = async () => {
        order.push('handler');
      };
      bus.register(token, handler);

      const middleware1: CommandMiddleware = {
        execute: async <R>(_name: string, _cmd: unknown, next: () => Promise<R>) => {
          order.push('mw1-before');
          const result = await next();
          order.push('mw1-after');
          return result;
        },
      };

      const middleware2: CommandMiddleware = {
        execute: async <R>(_name: string, _cmd: unknown, next: () => Promise<R>) => {
          order.push('mw2-before');
          const result = await next();
          order.push('mw2-after');
          return result;
        },
      };

      bus.use(middleware1);
      bus.use(middleware2);

      await bus.execute(token, { userId: 'u1' });

      expect(order).toEqual(['mw1-before', 'mw2-before', 'handler', 'mw2-after', 'mw1-after']);
    });

    it('middleware can modify the result of next()', async () => {
      const token = defineCommand<CreateUserInput, CreateUserOutput>('CreateUser');
      const handler: CommandHandler<CreateUserInput, CreateUserOutput> = async () => ({
        id: 'original',
        name: 'Original',
      });
      bus.register(token, handler);

      const middleware: CommandMiddleware = {
        execute: async <R>(_name: string, _cmd: unknown, next: () => Promise<R>) => {
          await next();
          return { id: 'modified', name: 'Modified' } as R;
        },
      };
      bus.use(middleware);

      const result = await bus.execute(token, {
        name: 'Test',
        email: 'test@example.com',
      });

      expect(result).toEqual({ id: 'modified', name: 'Modified' });
    });

    it('propagates middleware errors', async () => {
      const token = defineCommand<DeleteUserInput>('DeleteUser');
      const handler: CommandHandler<DeleteUserInput> = vi.fn().mockResolvedValue(undefined);
      bus.register(token, handler);

      const middleware: CommandMiddleware = {
        execute: async <R>(_name: string, _cmd: unknown, _next: () => Promise<R>): Promise<R> => {
          throw new Error('Middleware failure');
        },
      };
      bus.use(middleware);

      await expect(bus.execute(token, { userId: 'u1' })).rejects.toThrow('Middleware failure');

      // Handler should not be called since middleware threw an error
      expect(handler).not.toHaveBeenCalled();
    });

    it('does not execute the rest of the chain when an error occurs in a middleware', async () => {
      const token = defineCommand<DeleteUserInput>('DeleteUser');
      const handler: CommandHandler<DeleteUserInput> = vi.fn().mockResolvedValue(undefined);
      bus.register(token, handler);

      const middleware1: CommandMiddleware = {
        execute: async <R>(_name: string, _cmd: unknown, next: () => Promise<R>) => {
          return next();
        },
      };

      const errorMiddleware: CommandMiddleware = {
        execute: async <R>(_name: string, _cmd: unknown, _next: () => Promise<R>): Promise<R> => {
          throw new Error('Second middleware error');
        },
      };

      bus.use(middleware1);
      bus.use(errorMiddleware);

      await expect(bus.execute(token, { userId: 'u1' })).rejects.toThrow('Second middleware error');

      expect(handler).not.toHaveBeenCalled();
    });

    it('passes the correct command name to middleware', async () => {
      const token = defineCommand<DeleteUserInput>('DeleteUser');
      const handler: CommandHandler<DeleteUserInput> = vi.fn().mockResolvedValue(undefined);
      bus.register(token, handler);

      let receivedName = '';
      const middleware: CommandMiddleware = {
        execute: async <R>(name: string, _cmd: unknown, next: () => Promise<R>) => {
          receivedName = name;
          return next();
        },
      };
      bus.use(middleware);

      await bus.execute(token, { userId: 'u1' });

      expect(receivedName).toBe('DeleteUser');
    });

    it('passes the correct command data to middleware', async () => {
      const token = defineCommand<DeleteUserInput>('DeleteUser');
      const handler: CommandHandler<DeleteUserInput> = vi.fn().mockResolvedValue(undefined);
      bus.register(token, handler);

      let receivedCmd: unknown;
      const middleware: CommandMiddleware = {
        execute: async <R>(_name: string, cmd: unknown, next: () => Promise<R>) => {
          receivedCmd = cmd;
          return next();
        },
      };
      bus.use(middleware);

      const input: DeleteUserInput = { userId: 'u1' };
      await bus.execute(token, input);

      expect(receivedCmd).toEqual(input);
    });
  });

  // ============================
  // Type safety
  // ============================
  describe('type safety', () => {
    it('return type of execute() is correctly inferred (void)', () => {
      const token = defineCommand<DeleteUserInput>('DeleteUser');
      // Verify at type level only without actually calling bus.execute
      type Result = ReturnType<typeof bus.execute<DeleteUserInput, void>>;
      expectTypeOf<Result>().toEqualTypeOf<Promise<void>>();
      // Also verify phantom type on the token
      expectTypeOf(token._output).toEqualTypeOf<void>();
    });

    it('return type of execute() is correctly inferred (non-void)', () => {
      const token = defineCommand<CreateUserInput, CreateUserOutput>('CreateUser');
      type Result = ReturnType<typeof bus.execute<CreateUserInput, CreateUserOutput>>;
      expectTypeOf<Result>().toEqualTypeOf<Promise<CreateUserOutput>>();
      expectTypeOf(token._output).toEqualTypeOf<CreateUserOutput>();
    });

    it('register() handler type matches the token', () => {
      const token = defineCommand<CreateUserInput, CreateUserOutput>('CreateUser');
      // This function type compiling without errors proves type safety
      const handler: CommandHandler<CreateUserInput, CreateUserOutput> = async (input) => {
        expectTypeOf(input).toEqualTypeOf<CreateUserInput>();
        return { id: '1', name: input.name };
      };

      bus.register(token, handler);
    });
  });
});
