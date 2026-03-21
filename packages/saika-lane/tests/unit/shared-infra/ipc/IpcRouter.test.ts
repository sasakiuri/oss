// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { DomainError } from '@/shared/errors/DomainError';
import {
  command,
  CommandResponseSchema,
  defineContract,
  query,
  queryResponseSchema,
} from '@/shared/ipc/defineContract';

// ---------- hoisted mocks (vi.mock factories are hoisted, so use vi.hoisted) ----------

const { mockHandle, mockLogger } = vi.hoisted(() => ({
  mockHandle: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
  app: { isPackaged: false },
}));

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => mockLogger,
}));

// ---------- test contracts ----------

const testCommandContract = defineContract('test', {
  doSomething: command(z.object({ name: z.string() }), CommandResponseSchema),
  doVoid: command(CommandResponseSchema),
});

const testQueryContract = defineContract('testQuery', {
  getData: query(z.object({ id: z.string() }), queryResponseSchema(z.object({ value: z.number() }))),
  getAll: query(queryResponseSchema(z.array(z.string()))),
});

// ---------- helpers ----------

/**
 * Extract the registered ipcMain.handle callback for a given channel.
 */
function getRegisteredHandler(channel: string): (event: unknown, payload: unknown) => Promise<unknown> {
  const call = mockHandle.mock.calls.find((c: unknown[]) => c[0] === channel);
  if (!call) {
    throw new Error(`No handler registered for channel "${channel}"`);
  }
  return call[1] as (event: unknown, payload: unknown) => Promise<unknown>;
}

// ---------- tests ----------

describe('IpcRouter', () => {
  let router: IpcRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new IpcRouter();
  });

  // ============================
  // register()
  // ============================
  describe('register()', () => {
    it('registers command/query handlers with ipcMain.handle', () => {
      router.register(testCommandContract, {
        doSomething: vi.fn().mockResolvedValue(undefined),
        doVoid: vi.fn().mockResolvedValue(undefined),
      });

      expect(mockHandle).toHaveBeenCalledTimes(2);
      expect(mockHandle).toHaveBeenCalledWith('test:doSomething', expect.any(Function));
      expect(mockHandle).toHaveBeenCalledWith('test:doVoid', expect.any(Function));
    });

    it('registers a query contract with ipcMain.handle', () => {
      router.register(testQueryContract, {
        getData: vi.fn().mockResolvedValue({ value: 42 }),
        getAll: vi.fn().mockResolvedValue(['a', 'b']),
      });

      expect(mockHandle).toHaveBeenCalledTimes(2);
      expect(mockHandle).toHaveBeenCalledWith('testQuery:getData', expect.any(Function));
      expect(mockHandle).toHaveBeenCalledWith('testQuery:getAll', expect.any(Function));
    });
  });

  // ============================
  // IPC_HANDLER_MISSING
  // ============================
  describe('IPC_HANDLER_MISSING', () => {
    it('throws an IPC_HANDLER_MISSING error when a handler is missing', () => {
      expect(() => {
        router.register(testCommandContract, {
          doSomething: vi.fn().mockResolvedValue(undefined),
          // doVoid is missing
        } as any);
      }).toThrow(/IPC handler is missing/);
    });
  });

  // ============================
  // IPC_DUPLICATE_CHANNEL
  // ============================
  describe('IPC_DUPLICATE_CHANNEL', () => {
    it('throws an IPC_DUPLICATE_CHANNEL error when registering the same channel twice', () => {
      router.register(testCommandContract, {
        doSomething: vi.fn().mockResolvedValue(undefined),
        doVoid: vi.fn().mockResolvedValue(undefined),
      });

      expect(() => {
        router.register(testCommandContract, {
          doSomething: vi.fn().mockResolvedValue(undefined),
          doVoid: vi.fn().mockResolvedValue(undefined),
        });
      }).toThrow(/IPC duplicate channel registration/);
    });
  });

  // ============================
  // registeredChannels persistent state
  // ============================
  describe('registeredChannels persistent state', () => {
    it('retains all channels when multiple contracts are registered', () => {
      router.register(testCommandContract, {
        doSomething: vi.fn().mockResolvedValue(undefined),
        doVoid: vi.fn().mockResolvedValue(undefined),
      });

      router.register(testQueryContract, {
        getData: vi.fn().mockResolvedValue({ value: 42 }),
        getAll: vi.fn().mockResolvedValue(['a']),
      });

      // 4 channels total registered
      expect(mockHandle).toHaveBeenCalledTimes(4);

      // Attempting to re-register any channel from either contract should throw
      expect(() => {
        const overlapping = defineContract('test', {
          doSomething: command(z.object({ name: z.string() }), CommandResponseSchema),
        });
        router.register(overlapping, {
          doSomething: vi.fn().mockResolvedValue(undefined),
        });
      }).toThrow(/IPC duplicate channel registration/);
    });
  });

  // ============================
  // Zod validation failure
  // ============================
  describe('Zod validation failure', () => {
    it('command validation failure returns { success: false, error: VALIDATION_ERROR }', async () => {
      router.register(testCommandContract, {
        doSomething: vi.fn().mockResolvedValue(undefined),
        doVoid: vi.fn().mockResolvedValue(undefined),
      });

      const handler = getRegisteredHandler('test:doSomething');
      const result = await handler({}, { name: 123 }); // name should be string

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('Invalid IPC payload'),
          }),
        }),
      );
    });

    it('query validation failure returns { success: false, data: null, error: VALIDATION_ERROR }', async () => {
      router.register(testQueryContract, {
        getData: vi.fn().mockResolvedValue({ value: 42 }),
        getAll: vi.fn().mockResolvedValue([]),
      });

      const handler = getRegisteredHandler('testQuery:getData');
      const result = await handler({}, { id: 999 }); // id should be string

      expect(result).toEqual({
        success: false,
        data: null,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('Invalid IPC payload'),
        }),
      });
    });

    it('outputs a warn log on validation failure', async () => {
      router.register(testCommandContract, {
        doSomething: vi.fn().mockResolvedValue(undefined),
        doVoid: vi.fn().mockResolvedValue(undefined),
      });

      const handler = getRegisteredHandler('test:doSomething');
      await handler({}, { name: 123 });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Validation failed'),
        expect.anything(),
        expect.objectContaining({
          operation: 'doSomething',
        }),
      );
    });
  });

  // ============================
  // wrapCommand success
  // ============================
  describe('wrapCommand success', () => {
    it('handler success returns { success: true, data: result }', async () => {
      router.register(testCommandContract, {
        doSomething: vi.fn().mockResolvedValue('ok'),
        doVoid: vi.fn().mockResolvedValue(undefined),
      });

      const handler = getRegisteredHandler('test:doSomething');
      const result = await handler({}, { name: 'test' });

      expect(result).toEqual({ success: true, data: 'ok' });
    });

    it('passes validated data to the handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue(undefined);

      router.register(testCommandContract, {
        doSomething: mockHandler,
        doVoid: vi.fn().mockResolvedValue(undefined),
      });

      const handler = getRegisteredHandler('test:doSomething');
      await handler({}, { name: 'hello' });

      expect(mockHandler).toHaveBeenCalledWith({ name: 'hello' }, expect.anything());
    });
  });

  // ============================
  // wrapQuery success
  // ============================
  describe('wrapQuery success', () => {
    it('query success returns { success: true, data: result }', async () => {
      router.register(testQueryContract, {
        getData: vi.fn().mockResolvedValue({ value: 42 }),
        getAll: vi.fn().mockResolvedValue(['a', 'b']),
      });

      const handler = getRegisteredHandler('testQuery:getData');
      const result = await handler({}, { id: 'abc' });

      expect(result).toEqual({ success: true, data: { value: 42 } });
    });
  });

  // ============================
  // handler throw — error wrapping
  // ============================
  describe('handler throw — error wrapping', () => {
    it('command handler throw returns { success: false, error: ... }', async () => {
      router.register(testCommandContract, {
        doSomething: vi.fn().mockRejectedValue(new Error('Command failed')),
        doVoid: vi.fn().mockResolvedValue(undefined),
      });

      const handler = getRegisteredHandler('test:doSomething');
      const result = await handler({}, { name: 'test' });

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'UNKNOWN_ERROR',
            message: 'Command failed',
          }),
        }),
      );
    });

    it('query handler throw returns { success: false, data: null, error: ... }', async () => {
      router.register(testQueryContract, {
        getData: vi.fn().mockRejectedValue(new Error('Query failed')),
        getAll: vi.fn().mockResolvedValue([]),
      });

      const handler = getRegisteredHandler('testQuery:getData');
      const result = await handler({}, { id: 'abc' });

      expect(result).toEqual({
        success: false,
        data: null,
        error: expect.objectContaining({
          code: 'UNKNOWN_ERROR',
          message: 'Query failed',
        }),
      });
    });

    it('preserves the error code when a DomainError is thrown', async () => {
      // DomainError.wrap creates a DomainError from a generic Error
      const domainErr = DomainError.wrap(new Error('session not found'), 'SESSION_NOT_FOUND', 'Session not found');

      router.register(testCommandContract, {
        doSomething: vi.fn().mockRejectedValue(domainErr),
        doVoid: vi.fn().mockResolvedValue(undefined),
      });

      const handler = getRegisteredHandler('test:doSomething');
      const result = await handler({}, { name: 'test' });

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'SESSION_NOT_FOUND',
          }),
        }),
      );
    });

    it('outputs an error log on handler error', async () => {
      router.register(testCommandContract, {
        doSomething: vi.fn().mockRejectedValue(new Error('boom')),
        doVoid: vi.fn().mockResolvedValue(undefined),
      });

      const handler = getRegisteredHandler('test:doSomething');
      await handler({}, { name: 'test' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Command failed: doSomething'),
        expect.anything(),
        expect.objectContaining({
          operation: 'doSomething',
        }),
      );
    });
  });

  // ============================
  // z.void() input
  // ============================
  describe('z.void() input', () => {
    it('z.void() input command skips payload validation and executes the handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue('void-ok');

      router.register(testCommandContract, {
        doSomething: vi.fn().mockResolvedValue(undefined),
        doVoid: mockHandler,
      });

      const handler = getRegisteredHandler('test:doVoid');
      const result = await handler({}, undefined);

      expect(result).toEqual({ success: true, data: 'void-ok' });
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('z.void() input does not cause a validation error even when payload is provided', async () => {
      const mockHandler = vi.fn().mockResolvedValue('ok');

      router.register(testCommandContract, {
        doSomething: vi.fn().mockResolvedValue(undefined),
        doVoid: mockHandler,
      });

      const handler = getRegisteredHandler('test:doVoid');
      const result = await handler({}, { unexpected: 'data' });

      // Should still succeed — void input skips validation
      expect(result).toEqual({ success: true, data: 'ok' });
    });

    it('z.void() input query executes the handler successfully', async () => {
      const mockHandler = vi.fn().mockResolvedValue(['x', 'y']);

      router.register(testQueryContract, {
        getData: vi.fn().mockResolvedValue({ value: 0 }),
        getAll: mockHandler,
      });

      const handler = getRegisteredHandler('testQuery:getAll');
      const result = await handler({}, undefined);

      expect(result).toEqual({ success: true, data: ['x', 'y'] });
    });
  });
});
