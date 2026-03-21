// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mockOn = vi.hoisted(() => vi.fn());
const mockRemoveListener = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn(),
    on: mockOn,
    removeListener: mockRemoveListener,
  },
}));

import { createEventBridge } from '@/preload/createEventBridge';
import { defineEvent, defineEventContract } from '@/shared/ipc/defineContract';

describe('createEventBridge', () => {
  beforeEach(() => {
    mockOn.mockReset();
    mockRemoveListener.mockReset();
  });

  it('should create bridge with correct keys from event contract', () => {
    const contract = defineEventContract('test', {
      itemCreated: defineEvent(z.object({ id: z.string() })),
      itemDeleted: defineEvent(z.object({ id: z.string() })),
    });

    const bridge = createEventBridge(contract);

    expect(bridge).toHaveProperty('itemCreated');
    expect(bridge).toHaveProperty('itemDeleted');
    expect(typeof bridge.itemCreated).toBe('function');
    expect(typeof bridge.itemDeleted).toBe('function');
  });

  it('should call ipcRenderer.on when subscribing', () => {
    const contract = defineEventContract('evt', {
      update: defineEvent(z.object({ value: z.number() })),
    });

    const bridge = createEventBridge(contract);
    const callback = vi.fn();

    bridge.update(callback);

    expect(mockOn).toHaveBeenCalledTimes(1);
    expect(mockOn).toHaveBeenCalledWith('evt:update', expect.any(Function));
  });

  it('should use channel override when specified', () => {
    const contract = defineEventContract('evt', {
      custom: defineEvent(z.object({ data: z.string() }), { channel: 'custom:event' }),
    });

    const bridge = createEventBridge(contract);
    bridge.custom(vi.fn());

    expect(mockOn).toHaveBeenCalledWith('custom:event', expect.any(Function));
  });

  it('should return an unsubscribe function', () => {
    const contract = defineEventContract('evt', {
      notify: defineEvent(z.object({ msg: z.string() })),
    });

    const bridge = createEventBridge(contract);
    const unsub = bridge.notify(vi.fn());

    expect(typeof unsub).toBe('function');
  });

  it('should call ipcRenderer.removeListener on unsubscribe', () => {
    const contract = defineEventContract('evt', {
      notify: defineEvent(z.object({ msg: z.string() })),
    });

    const bridge = createEventBridge(contract);
    const unsub = bridge.notify(vi.fn());

    unsub();

    expect(mockRemoveListener).toHaveBeenCalledTimes(1);
    expect(mockRemoveListener).toHaveBeenCalledWith('evt:notify', expect.any(Function));
  });

  it('should pass the same handler reference to on and removeListener', () => {
    const contract = defineEventContract('evt', {
      data: defineEvent(z.object({ x: z.number() })),
    });

    const bridge = createEventBridge(contract);
    const unsub = bridge.data(vi.fn());

    const registeredHandler = mockOn.mock.calls[0]![1];
    unsub();
    const removedHandler = mockRemoveListener.mock.calls[0]![1];

    expect(registeredHandler).toBe(removedHandler);
  });

  it('should forward data from IPC event to callback', () => {
    const contract = defineEventContract('evt', {
      received: defineEvent(z.object({ value: z.number() })),
    });

    const bridge = createEventBridge(contract);
    const callback = vi.fn();

    bridge.received(callback);

    // Simulate IPC event delivery
    const handler = mockOn.mock.calls[0]![1] as (event: Electron.IpcRendererEvent, data: unknown) => void;
    const fakeEvent = {} as Electron.IpcRendererEvent;
    handler(fakeEvent, { value: 99 });

    expect(callback).toHaveBeenCalledWith({ value: 99 });
  });

  it('should handle multiple event subscriptions independently', () => {
    const contract = defineEventContract('evt', {
      alpha: defineEvent(z.object({ a: z.string() })),
      beta: defineEvent(z.object({ b: z.number() })),
    });

    const bridge = createEventBridge(contract);
    const cbAlpha = vi.fn();
    const cbBeta = vi.fn();

    const unsubAlpha = bridge.alpha(cbAlpha);
    const unsubBeta = bridge.beta(cbBeta);

    expect(mockOn).toHaveBeenCalledTimes(2);

    unsubAlpha();
    expect(mockRemoveListener).toHaveBeenCalledTimes(1);
    expect(mockRemoveListener).toHaveBeenCalledWith('evt:alpha', expect.any(Function));

    unsubBeta();
    expect(mockRemoveListener).toHaveBeenCalledTimes(2);
    expect(mockRemoveListener).toHaveBeenCalledWith('evt:beta', expect.any(Function));
  });
});
