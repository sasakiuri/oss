// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import { KeyedOperationQueue } from '@/main/shared-infra/operations/KeyedOperationQueue';

describe('KeyedOperationQueue', () => {
  it('waits for every shared resource while allowing unrelated operations to run', async () => {
    const queue = new KeyedOperationQueue();
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = queue.run(
      ['first'],
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const second = queue.run(
      ['second'],
      () =>
        new Promise<void>((resolve) => {
          releaseSecond = resolve;
        }),
    );
    const operation = vi.fn(async () => 'joined');
    const joined = queue.run(['first', 'second', 'first'], operation);
    await expect(queue.run(['other'], async () => 'independent')).resolves.toBe('independent');
    releaseFirst();
    await first;
    expect(operation).not.toHaveBeenCalled();
    releaseSecond();
    await second;
    await expect(joined).resolves.toBe('joined');
    expect(operation).toHaveBeenCalledOnce();
  });

  it('releases keys after failure without losing a newer queued operation', async () => {
    const queue = new KeyedOperationQueue();
    const calls: string[] = [];
    const failed = queue.run(['competition', 'membership'], async () => {
      throw new Error('failed');
    });
    const second = queue.run(['membership'], async () => {
      calls.push('second');
    });
    const third = queue.run(['membership'], async () => {
      calls.push('third');
    });
    await expect(failed).rejects.toThrow('failed');
    await Promise.all([second, third]);
    expect(calls).toEqual(['second', 'third']);
    await expect(queue.run(['competition'], async () => 'recovered')).resolves.toBe('recovered');
  });
});
