// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { createAppRuntime } from '@/main/composition/createAppRuntime';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { eventsContract } from '@/shared/ipc/contracts';

vi.mock('@/shared/utils/Logger', () => ({
  Logger: { create: () => ({ info: vi.fn(), warn: vi.fn(), logError: vi.fn() }) },
}));

function setup(failStartup = false, boardsClosed: Promise<void> = Promise.resolve()) {
  const order: string[] = [];
  const eventBus = new TypedEventBus();
  const broadcast = vi.fn();
  const dependencies = {
    eventBus,
    windowManager: {
      broadcast,
      closeAllBoardWindows: () => {
        order.push('windows');
        return boardsClosed;
      },
    },
    databaseManager: { close: () => order.push('database') },
    laneControlRepository: { close: () => order.push('repository') },
    laneTimerService: {
      restoreActiveTimers: async () => {
        order.push('restore');
      },
      stopAllTimers: () => order.push('timers'),
    },
    consoleForwarder: { stop: () => order.push('console') },
    lifecycleEntries: [
      {
        name: 'mqtt',
        start: async () => {
          order.push('mqtt:start');
          if (failStartup) throw new Error('mqtt unavailable');
        },
        stop: async () => {
          order.push('mqtt:stop');
        },
      },
    ],
    eventForwardingRules: [],
  } as unknown as Parameters<typeof createAppRuntime>[0];
  return { ...createAppRuntime(dependencies), order, eventBus, broadcast };
}

describe('application runtime composition', () => {
  it('keeps the database open until modules, timers and repository flushes finish', async () => {
    const { lifecycle, order, eventBus, broadcast } = setup();
    await lifecycle.startAll();
    eventBus.emit({ type: 'TimerTick', remainingTime: 12, phase: 'MATCH', timestamp: 1 });
    expect(broadcast).toHaveBeenCalledWith(eventsContract.channels.timerTick, { remainingTime: 12, phase: 'MATCH' });
    await lifecycle.stopAll();
    expect(order).toEqual([
      'restore',
      'mqtt:start',
      'mqtt:stop',
      'console',
      'windows',
      'timers',
      'repository',
      'database',
    ]);
    broadcast.mockClear();
    eventBus.emit({ type: 'TimerTick', remainingTime: 11, phase: 'MATCH', timestamp: 2 });
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('rolls back the composed infrastructure when a module cannot start', async () => {
    const { lifecycle, order } = setup(true);
    await expect(lifecycle.startAll()).rejects.toThrow('mqtt unavailable');
    expect(order).toEqual(['restore', 'mqtt:start', 'console', 'windows', 'timers', 'repository', 'database']);
  });

  it('waits for native board closure before releasing the repositories and database', async () => {
    let closeBoards!: () => void;
    const boardsClosed = new Promise<void>((resolve) => {
      closeBoards = resolve;
    });
    const { lifecycle, order } = setup(false, boardsClosed);
    await lifecycle.startAll();
    const stopping = lifecycle.stopAll();
    await vi.waitFor(() => expect(order).toContain('windows'));
    expect(order).not.toContain('database');
    closeBoards();
    await stopping;
    expect(order.at(-1)).toBe('database');
  });
});
