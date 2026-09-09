// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import { RuntimeOperationGate } from '@/main/shared-infra/operations/RuntimeOperationGate';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}

describe('RuntimeOperationGate', () => {
  it('lets independent control operations proceed concurrently', async () => {
    const gate = new RuntimeOperationGate();
    const barrier = deferred();
    const first = gate.runControl(() => barrier.promise);
    await expect(gate.runControl(async () => 'second')).resolves.toBe('second');
    barrier.resolve();
    await first;
  });

  it('waits for earlier controls and blocks later controls until the runtime transition completes', async () => {
    const gate = new RuntimeOperationGate();
    const controlBarrier = deferred();
    const transitionBarrier = deferred();
    const control = gate.runControl(() => controlBarrier.promise);
    const transitionStarted = deferred();
    const transitionOperation = vi.fn(() => {
      transitionStarted.resolve();
      return transitionBarrier.promise;
    });
    const transition = gate.runTransition(transitionOperation);
    const laterOperation = vi.fn(async () => 'later');
    const later = gate.runControl(laterOperation);
    await Promise.resolve();
    expect(transitionOperation).not.toHaveBeenCalled();
    expect(laterOperation).not.toHaveBeenCalled();
    controlBarrier.resolve();
    await control;
    await transitionStarted.promise;
    expect(laterOperation).not.toHaveBeenCalled();
    transitionBarrier.resolve();
    await transition;
    await expect(later).resolves.toBe('later');
  });

  it('preserves submission order across alternating runtime and control operations', async () => {
    const gate = new RuntimeOperationGate();
    const order: string[] = [];
    const tasks = [
      gate.runTransition(async () => {
        order.push('connect');
      }),
      gate.runControl(async () => {
        order.push('command');
      }),
      gate.runTransition(async () => {
        order.push('switch-broker');
      }),
      gate.runControl(async () => {
        order.push('next-command');
      }),
      gate.runTransition(async () => {
        order.push('shutdown');
      }),
    ];
    await Promise.all(tasks);
    expect(order).toEqual(['connect', 'command', 'switch-broker', 'next-command', 'shutdown']);
  });

  it('propagates operation failures while allowing subsequent transitions and controls', async () => {
    const gate = new RuntimeOperationGate();
    const failedControl = gate.runControl(async () => {
      throw new Error('control failed');
    });
    const failedTransition = gate.runTransition(async () => {
      throw new Error('transition failed');
    });
    const recovered = gate.runControl(async () => 'recovered');
    await expect(failedControl).rejects.toThrow('control failed');
    await expect(failedTransition).rejects.toThrow('transition failed');
    await expect(recovered).resolves.toBe('recovered');
    await expect(gate.runTransition(async () => 'shutdown')).resolves.toBe('shutdown');
  });
});
