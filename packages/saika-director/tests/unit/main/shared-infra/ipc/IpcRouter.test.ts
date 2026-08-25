import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import {
  command,
  commandDataResponseSchema,
  defineContract,
  query,
  queryResponseSchema,
} from '@/shared/ipc/defineContract';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  app: {
    isPackaged: false,
  },
}));

// Suppress Logger output in tests
vi.mock('@/shared/utils/Logger', () => ({
  Logger: {
    create: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      logError: vi.fn(),
    }),
  },
}));

import { ipcMain } from 'electron';

const mockedHandle = vi.mocked(ipcMain.handle);

describe('IpcRouter', () => {
  let router: IpcRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new IpcRouter();
  });

  // Helper: create a simple command contract
  function createCommandContract(input: z.ZodTypeAny = z.object({ name: z.string() })) {
    return defineContract('test', {
      doSomething: command(input, commandDataResponseSchema(z.unknown())),
    });
  }

  // Helper: create a simple query contract
  function createQueryContract(input: z.ZodTypeAny = z.object({ id: z.string() })) {
    return defineContract('test', {
      getData: query(input, queryResponseSchema(z.object({ data: z.string() }))),
    });
  }

  // Helper: extract the registered handler from ipcMain.handle mock
  function getRegisteredHandler(callIndex = 0): (event: unknown, payload: unknown) => Promise<unknown> {
    return mockedHandle.mock.calls[callIndex]![1] as (event: unknown, payload: unknown) => Promise<unknown>;
  }

  describe('register', () => {
    it('should register ipcMain.handle for each procedure in the contract', () => {
      const contract = defineContract('myNs', {
        cmd1: command(z.void(), z.object({ ok: z.boolean() })),
        cmd2: command(z.object({ x: z.number() }), z.object({ ok: z.boolean() })),
      });
      router.register(contract, {
        cmd1: vi.fn().mockResolvedValue({ ok: true }),
        cmd2: vi.fn().mockResolvedValue({ ok: true }),
      });

      expect(mockedHandle).toHaveBeenCalledTimes(2);
      expect(mockedHandle.mock.calls[0]![0]).toBe('myNs:cmd1');
      expect(mockedHandle.mock.calls[1]![0]).toBe('myNs:cmd2');
    });

    it('should throw if handler is missing for a procedure', () => {
      const contract = defineContract('test', {
        doSomething: command(z.void(), commandDataResponseSchema(z.object({ ok: z.boolean() }))),
      });
      expect(() => {
        router.register(contract, {} as never);
      }).toThrow('IpcRouter: missing handler for procedure "doSomething"');
    });

    it('should detect duplicate channel registration', () => {
      const contract1 = createCommandContract();
      const contract2 = createCommandContract();
      router.register(contract1, {
        doSomething: vi.fn().mockResolvedValue({ success: true }),
      });
      expect(() => {
        router.register(contract2, {
          doSomething: vi.fn().mockResolvedValue({ success: true }),
        });
      }).toThrow('IpcRouter: duplicate channel registration: "test:doSomething"');
    });

    it('should register multiple handlers from a single contract', () => {
      const contract = defineContract('multi', {
        action1: command(z.void(), z.object({ ok: z.boolean() })),
        action2: command(z.void(), z.object({ ok: z.boolean() })),
        query1: query(z.void(), z.object({ data: z.string() })),
      });
      router.register(contract, {
        action1: vi.fn().mockResolvedValue({ ok: true }),
        action2: vi.fn().mockResolvedValue({ ok: true }),
        query1: vi.fn().mockResolvedValue({ data: 'test' }),
      });

      expect(mockedHandle).toHaveBeenCalledTimes(3);
    });
  });

  describe('command execution', () => {
    it('should wrap successful command result in { success: true, data }', async () => {
      const contract = createCommandContract();
      const handler = vi.fn().mockResolvedValue({ result: 'ok' });
      router.register(contract, { doSomething: handler });

      const registeredHandler = getRegisteredHandler();
      const result = await registeredHandler(null, { name: 'test' });

      expect(result).toEqual({ success: true, data: { result: 'ok' } });
    });

    it('should execute command with z.void() input (no validation)', async () => {
      const contract = defineContract('test', {
        doSomething: command(z.void(), commandDataResponseSchema(z.object({ ok: z.boolean() }))),
      });
      const handler = vi.fn().mockResolvedValue({ ok: true });
      router.register(contract, { doSomething: handler });

      const registeredHandler = getRegisteredHandler();
      const result = await registeredHandler(null, undefined);

      expect(result).toEqual({ success: true, data: { ok: true } });
      expect(handler).toHaveBeenCalledWith(null);
    });

    it('should return IpcError on command Zod validation failure', async () => {
      const contract = createCommandContract();
      router.register(contract, {
        doSomething: vi.fn().mockResolvedValue({ success: true }),
      });

      const registeredHandler = getRegisteredHandler();
      const result = (await registeredHandler(null, { name: 123 })) as { success: boolean; error?: { code: string } };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(ErrorCatalog.IPC.INVALID_PAYLOAD.code);
    });

    it('should pass validated input to the handler', async () => {
      const contract = createCommandContract();
      const handler = vi.fn().mockResolvedValue({ success: true });
      router.register(contract, { doSomething: handler });

      const registeredHandler = getRegisteredHandler();
      await registeredHandler(null, { name: 'hello' });

      expect(handler).toHaveBeenCalledWith({ name: 'hello' }, null);
    });

    it('should convert handler error to IpcError in command response', async () => {
      const contract = createCommandContract();
      const handler = vi.fn().mockRejectedValue(new Error('Something went wrong'));
      router.register(contract, { doSomething: handler });

      const registeredHandler = getRegisteredHandler();
      const result = (await registeredHandler(null, { name: 'test' })) as {
        success: boolean;
        error?: { code: string; message: string; metadata?: Record<string, unknown> };
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('UNKNOWN_ERROR');
      expect(result.error!.message).toBe('Something went wrong');
    });

    it('should include operation name in error metadata', async () => {
      const contract = createCommandContract();
      const handler = vi.fn().mockRejectedValue(new Error('fail'));
      router.register(contract, { doSomething: handler });

      const registeredHandler = getRegisteredHandler();
      const result = (await registeredHandler(null, { name: 'test' })) as {
        success: boolean;
        error?: { metadata?: Record<string, unknown> };
      };

      expect(result.error?.metadata?.operation).toBe('doSomething');
    });
  });

  describe('query execution', () => {
    it('should wrap successful query result in { success: true, data }', async () => {
      const contract = createQueryContract();
      const handler = vi.fn().mockResolvedValue({ data: 'result' });
      router.register(contract, { getData: handler });

      const registeredHandler = getRegisteredHandler();
      const result = await registeredHandler(null, { id: 'abc' });

      expect(result).toEqual({ success: true, data: { data: 'result' } });
    });

    it('should return IpcError on query Zod validation failure', async () => {
      const contract = createQueryContract();
      router.register(contract, {
        getData: vi.fn().mockResolvedValue({ data: 'ok' }),
      });

      const registeredHandler = getRegisteredHandler();
      const result = (await registeredHandler(null, { id: 123 })) as {
        success: boolean;
        data: unknown;
        error?: { code: string };
      };

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(ErrorCatalog.IPC.INVALID_PAYLOAD.code);
    });

    it('should convert handler error to QueryErrorResponse', async () => {
      const contract = createQueryContract();
      const handler = vi.fn().mockRejectedValue(new Error('Query failed'));
      router.register(contract, { getData: handler });

      const registeredHandler = getRegisteredHandler();
      const result = (await registeredHandler(null, { id: 'abc' })) as {
        success: boolean;
        data: unknown;
        error?: { code: string; message: string };
      };

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error!.message).toBe('Query failed');
    });

    it('should execute query with z.void() input (no validation)', async () => {
      const contract = defineContract('test', {
        getData: query(z.void(), queryResponseSchema(z.object({ data: z.string() }))),
      });
      const handler = vi.fn().mockResolvedValue({ data: 'result' });
      router.register(contract, { getData: handler });

      const registeredHandler = getRegisteredHandler();
      const result = await registeredHandler(null, undefined);

      expect(result).toEqual({ success: true, data: { data: 'result' } });
      expect(handler).toHaveBeenCalledWith(null);
    });
  });

  describe('validation details', () => {
    it('rejects handler output that violates the procedure response schema', async () => {
      const contract = defineContract('test', {
        getData: query(z.object({ id: z.string() }), queryResponseSchema(z.object({ value: z.string() }))),
      });
      router.register(contract, {
        getData: vi.fn().mockResolvedValue({ value: 42 }),
      });

      const registeredHandler = getRegisteredHandler();
      const result = (await registeredHandler(null, { id: 'abc' })) as {
        success: boolean;
        data: unknown;
        error?: { code: string };
      };

      expect(result).toMatchObject({
        success: false,
        data: null,
        error: { code: 'IPC_002' },
      });
    });

    it('should skip validation for z.void() input', async () => {
      const contract = defineContract('test', {
        action: command(z.void(), commandDataResponseSchema(z.object({ ok: z.boolean() }))),
      });
      const handler = vi.fn().mockResolvedValue({ ok: true });
      router.register(contract, { action: handler });

      const registeredHandler = getRegisteredHandler();
      // Even with random payload, void input should skip validation
      const result = await registeredHandler(null, { random: 'data' });

      expect(result).toEqual({ success: true, data: { ok: true } });
      expect(handler).toHaveBeenCalledWith(null);
    });

    it('should include validation error details in metadata', async () => {
      const contract = defineContract('test', {
        action: command(
          z.object({ email: z.string().email(), age: z.number().min(0) }),
          commandDataResponseSchema(z.object({ ok: z.boolean() })),
        ),
      });
      router.register(contract, {
        action: vi.fn().mockResolvedValue({ ok: true }),
      });

      const registeredHandler = getRegisteredHandler();
      const result = (await registeredHandler(null, { email: 'not-email', age: -1 })) as {
        success: boolean;
        error?: { metadata?: { validationErrors?: Array<{ path: string; message: string }> } };
      };

      expect(result.success).toBe(false);
      expect(result.error?.metadata?.validationErrors).toBeDefined();
      expect(Array.isArray(result.error?.metadata?.validationErrors)).toBe(true);
    });

    it('should validate large payloads correctly', async () => {
      const contract = defineContract('test', {
        action: command(
          z.object({ items: z.array(z.number()).max(100) }),
          commandDataResponseSchema(z.object({ ok: z.boolean() })),
        ),
      });
      const handler = vi.fn().mockResolvedValue({ ok: true });
      router.register(contract, { action: handler });

      const registeredHandler = getRegisteredHandler();

      // Valid large payload
      const validResult = await registeredHandler(null, {
        items: Array.from({ length: 100 }, (_, i) => i),
      });
      expect(validResult).toEqual({ success: true, data: { ok: true } });

      // Invalid large payload (exceeds max)
      const invalidResult = (await registeredHandler(null, {
        items: Array.from({ length: 101 }, (_, i) => i),
      })) as { success: boolean };
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('error response format', () => {
    it('should format command error response as { success: false, error: IpcError }', async () => {
      const contract = createCommandContract();
      router.register(contract, {
        doSomething: vi.fn().mockRejectedValue(new Error('fail')),
      });

      const registeredHandler = getRegisteredHandler();
      const result = (await registeredHandler(null, { name: 'test' })) as Record<string, unknown>;

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
      expect(result).not.toHaveProperty('data');
    });

    it('should format query error response as { success: false, data: null, error: IpcError }', async () => {
      const contract = createQueryContract();
      router.register(contract, {
        getData: vi.fn().mockRejectedValue(new Error('fail')),
      });

      const registeredHandler = getRegisteredHandler();
      const result = (await registeredHandler(null, { id: 'abc' })) as Record<string, unknown>;

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('data', null);
      expect(result).toHaveProperty('error');
    });

    it('should include IpcError type information (code, message)', async () => {
      const contract = createCommandContract();
      // Validation error
      router.register(contract, {
        doSomething: vi.fn().mockResolvedValue({ success: true }),
      });

      const registeredHandler = getRegisteredHandler();
      const result = (await registeredHandler(null, { name: 42 })) as {
        error?: { code: string; message: string };
      };

      expect(result.error).toHaveProperty('code');
      expect(result.error).toHaveProperty('message');
      expect(typeof result.error!.code).toBe('string');
      expect(typeof result.error!.message).toBe('string');
    });
  });

  describe('event propagation', () => {
    it('should pass IpcMainInvokeEvent to handler with non-void input', async () => {
      const contract = createCommandContract();
      const handler = vi.fn().mockResolvedValue({ success: true });
      router.register(contract, { doSomething: handler });

      const fakeEvent = { sender: { id: 1 } };
      const registeredHandler = getRegisteredHandler();
      await registeredHandler(fakeEvent, { name: 'test' });

      expect(handler).toHaveBeenCalledWith({ name: 'test' }, fakeEvent);
    });

    it('should pass IpcMainInvokeEvent to handler with void input', async () => {
      const contract = defineContract('test', {
        doSomething: command(z.void(), commandDataResponseSchema(z.object({ ok: z.boolean() }))),
      });
      const handler = vi.fn().mockResolvedValue({ ok: true });
      router.register(contract, { doSomething: handler });

      const fakeEvent = { sender: { id: 42 } };
      const registeredHandler = getRegisteredHandler();
      await registeredHandler(fakeEvent, undefined);

      expect(handler).toHaveBeenCalledWith(fakeEvent);
    });

    it('should pass IpcMainInvokeEvent to query handler', async () => {
      const contract = createQueryContract();
      const handler = vi.fn().mockResolvedValue({ data: 'test' });
      router.register(contract, { getData: handler });

      const fakeEvent = { sender: { id: 99 } };
      const registeredHandler = getRegisteredHandler();
      await registeredHandler(fakeEvent, { id: 'abc' });

      expect(handler).toHaveBeenCalledWith({ id: 'abc' }, fakeEvent);
    });
  });
});
