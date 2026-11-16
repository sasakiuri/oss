// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { SerialQueue } from '@/main/shared-infra/operations/SerialQueue';

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('SerialQueue', () => {
  it('starts an operation only after the previous one settles, in call order', async () => {
    const queue = new SerialQueue();
    const first = deferred();
    const events: string[] = [];

    const firstRun = queue.run(async () => {
      events.push('first:start');
      await first.promise;
      events.push('first:end');
    });
    const secondRun = queue.run(() => {
      events.push('second');
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(['first:start']);

    first.resolve();
    await Promise.all([firstRun, secondRun]);
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('does not call the operation synchronously', () => {
    const queue = new SerialQueue();
    let called = false;
    void queue.run(() => {
      called = true;
    });
    expect(called).toBe(false);
  });

  it('returns the operation result to its caller', async () => {
    const queue = new SerialQueue();
    await expect(queue.run(() => 7)).resolves.toBe(7);
    await expect(queue.run(() => Promise.resolve('value'))).resolves.toBe('value');
  });

  it('rejects only the failed caller and keeps running later operations', async () => {
    const queue = new SerialQueue();
    const failed = queue.run(() => Promise.reject(new Error('publish failed')));
    const thrown = queue.run(() => {
      throw new Error('sync failure');
    });
    const later = queue.run(() => 'later');

    await expect(failed).rejects.toThrow('publish failed');
    await expect(thrown).rejects.toThrow('sync failure');
    await expect(later).resolves.toBe('later');
  });

  it('waits for a failed operation to settle before starting the next one', async () => {
    const queue = new SerialQueue();
    const first = deferred();
    const events: string[] = [];

    const firstRun = queue.run(async () => {
      events.push('first:start');
      await first.promise;
    });
    const secondRun = queue.run(() => {
      events.push('second');
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(['first:start']);

    first.reject(new Error('failed'));
    await expect(firstRun).rejects.toThrow('failed');
    await secondRun;
    expect(events).toEqual(['first:start', 'second']);
  });
});
