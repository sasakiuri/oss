import { z } from 'zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defineEvent, defineEventContract } from '@/shared/ipc/defineContract';

const electronMocks = vi.hoisted(() => ({
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcRenderer: electronMocks,
}));

import { buildEventBridge } from '@/preload/buildPreloadAPI';

describe('buildEventBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delivers only event payloads that satisfy the contract schema', () => {
    const contract = defineEventContract('test', {
      updated: defineEvent(z.object({ value: z.string() })),
    });
    const callback = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bridge = buildEventBridge(contract);

    bridge.updated(callback);
    const handler = electronMocks.on.mock.calls[0]![1] as (event: unknown, data: unknown) => void;
    handler(null, { value: 42 });
    handler(null, { value: 'ready', ignored: true });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({ value: 'ready' });
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
