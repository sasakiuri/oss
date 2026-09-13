// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsoleForwarder } from '@/main/infrastructure/logging/ConsoleForwarder';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

describe('ConsoleForwarder', () => {
  const eventBus = { emit: vi.fn(), on: vi.fn() } satisfies IEventBus;
  let forwarder: ConsoleForwarder;
  let originalLog: ReturnType<typeof vi.spyOn>;
  let originalWarn: ReturnType<typeof vi.spyOn>;
  let originalError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(123456);
    originalLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    originalWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    originalError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    forwarder = new ConsoleForwarder(eventBus);
  });

  afterEach(() => {
    forwarder.stop();
    vi.restoreAllMocks();
  });

  it('preserves original console arguments and forwards a timestamped serialized event', () => {
    forwarder.start();
    const details = { laneId: 'lane-1', ready: true };
    console.log('Ready', details, 42, false, null, undefined, Symbol('marker'));
    expect(originalLog).toHaveBeenCalledWith('Ready', details, 42, false, null, undefined, expect.any(Symbol));
    expect(eventBus.emit).toHaveBeenCalledExactlyOnceWith({
      type: 'DebugLogEmitted',
      timestamp: 123456,
      direction: 'LOG',
      raw: 'Ready {"laneId":"lane-1","ready":true} 42 false null undefined Symbol(marker)',
    });
  });

  it('keeps warning and error severity visible while retaining native console output', () => {
    forwarder.start();
    console.warn('Retry', { attempts: 2 });
    console.error('Unavailable', 503);
    expect(originalWarn).toHaveBeenCalledExactlyOnceWith('Retry', { attempts: 2 });
    expect(originalError).toHaveBeenCalledExactlyOnceWith('Unavailable', 503);
    expect(eventBus.emit.mock.calls.map(([event]) => event.raw)).toEqual([
      '[WARN] Retry {"attempts":2}',
      '[ERROR] Unavailable 503',
    ]);
  });

  it('falls back to inspection for cyclic objects and continues forwarding later logs', () => {
    forwarder.start();
    const cycle: { name: string; self?: unknown } = { name: 'cycle' };
    cycle.self = cycle;
    expect(() => console.log(cycle)).not.toThrow();
    console.log('Recovered');
    expect(originalLog).toHaveBeenNthCalledWith(1, cycle);
    expect(eventBus.emit).toHaveBeenCalledTimes(2);
    expect(eventBus.emit.mock.calls[0]![0].raw).toContain('cycle');
    expect(eventBus.emit.mock.calls[0]![0].raw).toContain('[Circular');
    expect(eventBus.emit.mock.calls[1]![0].raw).toBe('Recovered');
  });

  it('stops forwarding on shutdown and can restart without duplicating delivery', () => {
    forwarder.start();
    console.log('Before stop');
    forwarder.stop();
    console.log('After stop');
    console.warn('Native warning');
    console.error('Native error');
    expect(eventBus.emit).toHaveBeenCalledTimes(1);
    expect(originalLog).toHaveBeenNthCalledWith(2, 'After stop');
    expect(originalWarn).toHaveBeenCalledExactlyOnceWith('Native warning');
    expect(originalError).toHaveBeenCalledExactlyOnceWith('Native error');

    forwarder.start();
    console.log('Restarted');
    expect(originalLog).toHaveBeenCalledTimes(3);
    expect(eventBus.emit).toHaveBeenCalledTimes(2);
    expect(eventBus.emit.mock.calls[1]![0].raw).toBe('Restarted');
  });
});
