// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: mockInvoke,
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

import { createBridgeNamespace } from '@/preload/createBridge';
import {
  command,
  CommandResponseSchema,
  defineContract,
  query,
  queryResponseSchema,
} from '@/shared/ipc/defineContract';

describe('createBridgeNamespace', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('should create bridge with correct keys from contract', () => {
    const contract = defineContract('test', {
      doSomething: command(z.object({ id: z.string() }), CommandResponseSchema),
      getItems: query(queryResponseSchema(z.array(z.string()))),
    });

    const bridge = createBridgeNamespace(contract);

    expect(bridge).toHaveProperty('doSomething');
    expect(bridge).toHaveProperty('getItems');
    expect(typeof bridge.doSomething).toBe('function');
    expect(typeof bridge.getItems).toBe('function');
  });

  it('should call ipcRenderer.invoke with channel and payload for input procedures', async () => {
    const contract = defineContract('ns', {
      save: command(z.object({ name: z.string() }), CommandResponseSchema),
    });

    const bridge = createBridgeNamespace(contract);
    mockInvoke.mockResolvedValue({ success: true });

    await bridge.save({ name: 'test' });

    expect(mockInvoke).toHaveBeenCalledWith('ns:save', { name: 'test' });
  });

  it('should call ipcRenderer.invoke with channel only for void input procedures', async () => {
    const contract = defineContract('ns', {
      reset: command(CommandResponseSchema),
    });

    const bridge = createBridgeNamespace(contract);
    mockInvoke.mockResolvedValue({ success: true });

    await bridge.reset();

    expect(mockInvoke).toHaveBeenCalledWith('ns:reset');
  });

  it('should use channel override when specified', async () => {
    const contract = defineContract('ns', {
      action: command(CommandResponseSchema, { channel: 'custom:channel' }),
    });

    const bridge = createBridgeNamespace(contract);
    mockInvoke.mockResolvedValue({ success: true });

    await bridge.action();

    expect(mockInvoke).toHaveBeenCalledWith('custom:channel');
  });

  it('should return the promise from ipcRenderer.invoke', async () => {
    const contract = defineContract('ns', {
      fetch: query(z.object({ id: z.string() }), queryResponseSchema(z.object({ value: z.number() }))),
    });

    const bridge = createBridgeNamespace(contract);
    const expected = { success: true, data: { value: 42 } };
    mockInvoke.mockResolvedValue(expected);

    const result = await bridge.fetch({ id: 'abc' });

    expect(result).toEqual(expected);
  });

  it('should handle multiple procedures in a single contract', async () => {
    const contract = defineContract('multi', {
      create: command(z.object({ name: z.string() }), CommandResponseSchema),
      delete: command(z.object({ id: z.string() }), CommandResponseSchema),
      list: query(queryResponseSchema(z.array(z.string()))),
    });

    const bridge = createBridgeNamespace(contract);
    mockInvoke.mockResolvedValue({ success: true });

    await bridge.create({ name: 'item' });
    await bridge.delete({ id: '123' });
    await bridge.list();

    expect(mockInvoke).toHaveBeenCalledTimes(3);
    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'multi:create', { name: 'item' });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'multi:delete', { id: '123' });
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'multi:list');
  });

  it('should propagate rejection from ipcRenderer.invoke', async () => {
    const contract = defineContract('ns', {
      failing: command(CommandResponseSchema),
    });

    const bridge = createBridgeNamespace(contract);
    mockInvoke.mockRejectedValue(new Error('IPC failure'));

    await expect(bridge.failing()).rejects.toThrow('IPC failure');
  });
});
