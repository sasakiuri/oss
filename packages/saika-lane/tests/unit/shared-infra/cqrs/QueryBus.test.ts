// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { QueryHandler, QueryMiddleware, QueryToken } from '@/main/shared-infra/cqrs/QueryBus';
import { QueryBus, defineQuery } from '@/main/shared-infra/cqrs/QueryBus';

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

interface GetUserInput {
  userId: string;
}

interface UserOutput {
  id: string;
  name: string;
  email: string;
}

interface GetScoreInput {
  sessionId: string;
}

interface ScoreOutput {
  total: number;
  average: number;
}

interface ListUsersInput {
  page: number;
  limit: number;
}

interface ListUsersOutput {
  users: UserOutput[];
  totalCount: number;
}

// ---------- Tests ----------

describe('QueryBus', () => {
  let bus: QueryBus;

  beforeEach(() => {
    bus = new QueryBus();
  });

  // ============================
  // defineQuery()
  // ============================
  describe('defineQuery()', () => {
    it('creates a token with the specified name', () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      expect(token.name).toBe('GetUser');
    });

    it('creates different tokens for different names', () => {
      const token1 = defineQuery<GetUserInput, UserOutput>('GetUser');
      const token2 = defineQuery<GetScoreInput, ScoreOutput>('GetScore');
      expect(token1.name).not.toBe(token2.name);
    });

    it('phantom types are correctly inferred', () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      expectTypeOf(token).toMatchTypeOf<QueryToken<GetUserInput, UserOutput>>();
    });

    it('phantom types are preserved for complex output types', () => {
      const token = defineQuery<ListUsersInput, ListUsersOutput>('ListUsers');
      expectTypeOf(token).toMatchTypeOf<QueryToken<ListUsersInput, ListUsersOutput>>();
    });
  });

  // ============================
  // register()
  // ============================
  describe('register()', () => {
    it('registers a query handler', () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      const handler: QueryHandler<GetUserInput, UserOutput> = vi
        .fn()
        .mockResolvedValue({ id: 'u1', name: 'Taro', email: 'taro@test.com' });

      expect(() => {
        bus.register(token, handler);
      }).not.toThrow();
    });

    it('throws a QUERY_DUPLICATE_HANDLER error when re-registering the same token', () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');

      const handler1: QueryHandler<GetUserInput, UserOutput> = vi.fn().mockResolvedValue({
        id: 'h1',
        name: 'Handler1',
        email: 'h1@test.com',
      });
      const handler2: QueryHandler<GetUserInput, UserOutput> = vi.fn().mockResolvedValue({
        id: 'h2',
        name: 'Handler2',
        email: 'h2@test.com',
      });

      bus.register(token, handler1);

      expect(() => bus.register(token, handler2)).toThrow('Duplicate query handler registration');
      expect(mockError).toHaveBeenCalledWith(expect.stringContaining('GetUser'));
    });
  });

  // ============================
  // execute()
  // ============================
  describe('execute()', () => {
    it('calls the registered handler with the correct input', async () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      const handler: QueryHandler<GetUserInput, UserOutput> = vi
        .fn()
        .mockResolvedValue({ id: 'u1', name: 'Taro', email: 'taro@test.com' });

      bus.register(token, handler);

      const input: GetUserInput = { userId: 'u1' };
      await bus.execute(token, input);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(input);
    });

    it('correctly returns the handler return value', async () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      const expectedOutput: UserOutput = {
        id: 'u1',
        name: 'Taro',
        email: 'taro@example.com',
      };
      const handler: QueryHandler<GetUserInput, UserOutput> = vi.fn().mockResolvedValue(expectedOutput);

      bus.register(token, handler);

      const result = await bus.execute(token, { userId: 'u1' });

      expect(result).toEqual(expectedOutput);
    });

    it('throws an error when executing with an unregistered token', async () => {
      const token = defineQuery<GetUserInput, UserOutput>('UnregisteredQuery');

      await expect(bus.execute(token, { userId: 'u1' })).rejects.toThrow('Query handler not found');
    });

    it('propagates handler errors', async () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      const expectedError = new Error('User not found');
      const handler: QueryHandler<GetUserInput, UserOutput> = vi.fn().mockRejectedValue(expectedError);

      bus.register(token, handler);

      await expect(bus.execute(token, { userId: 'u1' })).rejects.toThrow('User not found');
    });

    it('can execute the same token multiple times', async () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      const result1: UserOutput = {
        id: 'u1',
        name: 'Taro',
        email: 'taro@test.com',
      };
      const result2: UserOutput = {
        id: 'u2',
        name: 'Jiro',
        email: 'jiro@test.com',
      };

      const handler: QueryHandler<GetUserInput, UserOutput> = vi
        .fn()
        .mockResolvedValueOnce(result1)
        .mockResolvedValueOnce(result2);

      bus.register(token, handler);

      const actual1 = await bus.execute(token, { userId: 'u1' });
      const actual2 = await bus.execute(token, { userId: 'u2' });

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenNthCalledWith(1, { userId: 'u1' });
      expect(handler).toHaveBeenNthCalledWith(2, { userId: 'u2' });
      expect(actual1).toEqual(result1);
      expect(actual2).toEqual(result2);
    });

    it('can execute different query tokens independently', async () => {
      const userToken = defineQuery<GetUserInput, UserOutput>('GetUser');
      const scoreToken = defineQuery<GetScoreInput, ScoreOutput>('GetScore');

      const userHandler: QueryHandler<GetUserInput, UserOutput> = vi.fn().mockResolvedValue({
        id: 'u1',
        name: 'Taro',
        email: 'taro@test.com',
      });
      const scoreHandler: QueryHandler<GetScoreInput, ScoreOutput> = vi
        .fn()
        .mockResolvedValue({ total: 580, average: 9.67 });

      bus.register(userToken, userHandler);
      bus.register(scoreToken, scoreHandler);

      const userResult = await bus.execute(userToken, { userId: 'u1' });
      const scoreResult = await bus.execute(scoreToken, { sessionId: 's1' });

      expect(userHandler).toHaveBeenCalledWith({ userId: 'u1' });
      expect(scoreHandler).toHaveBeenCalledWith({ sessionId: 's1' });
      expect(userResult.name).toBe('Taro');
      expect(scoreResult.total).toBe(580);
    });
  });

  // ============================
  // Middleware
  // ============================
  describe('middleware', () => {
    it('middleware is executed during execute', async () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      const handler: QueryHandler<GetUserInput, UserOutput> = vi
        .fn()
        .mockResolvedValue({ id: 'u1', name: 'T', email: 't@t.com' });
      bus.register(token, handler);

      const calls: Array<{ name: string; query: unknown }> = [];
      const middleware: QueryMiddleware = {
        execute: async <R>(name: string, query: unknown, next: () => Promise<R>) => {
          calls.push({ name, query });
          return next();
        },
      };
      bus.use(middleware);

      await bus.execute(token, { userId: 'u1' });

      expect(calls).toHaveLength(1);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('middleware chain executes in the correct order (first registered = outermost)', async () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      const order: string[] = [];

      const handler: QueryHandler<GetUserInput, UserOutput> = async () => {
        order.push('handler');
        return { id: 'u1', name: 'T', email: 't@t.com' };
      };
      bus.register(token, handler);

      const middleware1: QueryMiddleware = {
        execute: async <R>(_name: string, _q: unknown, next: () => Promise<R>) => {
          order.push('mw1-before');
          const result = await next();
          order.push('mw1-after');
          return result;
        },
      };

      const middleware2: QueryMiddleware = {
        execute: async <R>(_name: string, _q: unknown, next: () => Promise<R>) => {
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
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      const handler: QueryHandler<GetUserInput, UserOutput> = async () => ({
        id: 'u1',
        name: 'Original',
        email: 'orig@test.com',
      });
      bus.register(token, handler);

      const middleware: QueryMiddleware = {
        execute: async <R>(_name: string, _q: unknown, next: () => Promise<R>) => {
          await next();
          return { id: 'u1', name: 'Modified', email: 'mod@test.com' } as R;
        },
      };
      bus.use(middleware);

      const result = await bus.execute(token, { userId: 'u1' });

      expect(result.name).toBe('Modified');
    });

    it('propagates middleware errors', async () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      const handler: QueryHandler<GetUserInput, UserOutput> = vi
        .fn()
        .mockResolvedValue({ id: 'u1', name: 'T', email: 't@t.com' });
      bus.register(token, handler);

      const middleware: QueryMiddleware = {
        execute: async <R>(_name: string, _q: unknown, _next: () => Promise<R>): Promise<R> => {
          throw new Error('Query middleware failure');
        },
      };
      bus.use(middleware);

      await expect(bus.execute(token, { userId: 'u1' })).rejects.toThrow('Query middleware failure');

      expect(handler).not.toHaveBeenCalled();
    });

    it('passes the correct query name to middleware', async () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      const handler: QueryHandler<GetUserInput, UserOutput> = vi
        .fn()
        .mockResolvedValue({ id: 'u1', name: 'T', email: 't@t.com' });
      bus.register(token, handler);

      let receivedName = '';
      const middleware: QueryMiddleware = {
        execute: async <R>(name: string, _q: unknown, next: () => Promise<R>) => {
          receivedName = name;
          return next();
        },
      };
      bus.use(middleware);

      await bus.execute(token, { userId: 'u1' });

      expect(receivedName).toBe('GetUser');
    });

    it('passes the correct query data to middleware', async () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      const handler: QueryHandler<GetUserInput, UserOutput> = vi
        .fn()
        .mockResolvedValue({ id: 'u1', name: 'T', email: 't@t.com' });
      bus.register(token, handler);

      let receivedQuery: unknown;
      const middleware: QueryMiddleware = {
        execute: async <R>(_name: string, q: unknown, next: () => Promise<R>) => {
          receivedQuery = q;
          return next();
        },
      };
      bus.use(middleware);

      const input: GetUserInput = { userId: 'u1' };
      await bus.execute(token, input);

      expect(receivedQuery).toEqual(input);
    });
  });

  // ============================
  // Type safety
  // ============================
  describe('type safety', () => {
    it('return type of execute() is correctly inferred', () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      // Verify at type level only without actually calling bus.execute
      type Result = ReturnType<typeof bus.execute<GetUserInput, UserOutput>>;
      expectTypeOf<Result>().toEqualTypeOf<Promise<UserOutput>>();
      // Also verify phantom type on the token
      expectTypeOf(token._output).toEqualTypeOf<UserOutput>();
    });

    it('correctly inferred for tokens with different output types', () => {
      const token = defineQuery<GetScoreInput, ScoreOutput>('GetScore');
      type Result = ReturnType<typeof bus.execute<GetScoreInput, ScoreOutput>>;
      expectTypeOf<Result>().toEqualTypeOf<Promise<ScoreOutput>>();
      expectTypeOf(token._output).toEqualTypeOf<ScoreOutput>();
    });

    it('register() handler type matches the token', () => {
      const token = defineQuery<GetUserInput, UserOutput>('GetUser');
      const handler: QueryHandler<GetUserInput, UserOutput> = async (input) => {
        expectTypeOf(input).toEqualTypeOf<GetUserInput>();
        return { id: input.userId, name: 'Test', email: 'test@test.com' };
      };

      bus.register(token, handler);
    });
  });
});
