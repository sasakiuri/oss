// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ProtocolTimerClock,
  SerializedProtocolTimer,
} from '@/main/modules/connection/infra/usb/SerializedProtocolTimer';

describe('SerializedProtocolTimer', () => {
  const clock: ProtocolTimerClock = {
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function createPendingWrite() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  function createQueue() {
    let tail = Promise.resolve();
    return (operation: () => Promise<void>): Promise<void> => {
      const result = tail.then(operation);
      tail = result.catch(() => undefined);
      return result;
    };
  }

  function createOperation() {
    return { isCurrent: vi.fn(() => true), run: vi.fn(), onError: vi.fn() };
  }

  it('waits for the deadline and the shared serial operation queue', async () => {
    const queue = createQueue();
    const writing = createPendingWrite();
    void queue(() => writing.promise);
    const timer = new SerializedProtocolTimer(clock, queue);
    const operation = createOperation();

    timer.schedule(100, operation);
    await vi.advanceTimersByTimeAsync(99);
    expect(operation.run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(operation.run).not.toHaveBeenCalled();

    writing.resolve();
    await queue(async () => undefined);
    expect(operation.isCurrent).toHaveBeenCalledOnce();
    expect(operation.run).toHaveBeenCalledOnce();
    expect(operation.onError).not.toHaveBeenCalled();
  });

  it('cancels work whose timeout already fired while the queue was busy', async () => {
    const queue = createQueue();
    const writing = createPendingWrite();
    void queue(() => writing.promise);
    const timer = new SerializedProtocolTimer(clock, queue);
    const operation = createOperation();

    timer.schedule(100, operation);
    await vi.advanceTimersByTimeAsync(100);
    timer.cancel();
    writing.resolve();
    await queue(async () => undefined);

    expect(operation.isCurrent).not.toHaveBeenCalled();
    expect(operation.run).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces queued work without losing the new deadline', async () => {
    const queue = createQueue();
    const writing = createPendingWrite();
    void queue(() => writing.promise);
    const timer = new SerializedProtocolTimer(clock, queue);
    const previous = createOperation();
    const replacement = createOperation();

    timer.schedule(100, previous);
    await vi.advanceTimersByTimeAsync(100);
    timer.schedule(200, replacement);
    writing.resolve();
    await queue(async () => undefined);
    await vi.advanceTimersByTimeAsync(199);
    expect(previous.run).not.toHaveBeenCalled();
    expect(replacement.run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(replacement.run).toHaveBeenCalledOnce();
  });

  it('checks live protocol state when queued work begins', async () => {
    const queue = createQueue();
    const writing = createPendingWrite();
    void queue(() => writing.promise);
    const timer = new SerializedProtocolTimer(clock, queue);
    const operation = createOperation();

    timer.schedule(100, operation);
    await vi.advanceTimersByTimeAsync(100);
    operation.isCurrent.mockReturnValue(false);
    writing.resolve();
    await queue(async () => undefined);

    expect(operation.isCurrent).toHaveBeenCalledOnce();
    expect(operation.run).not.toHaveBeenCalled();
  });

  it('ignores a cancelled callback delivered late by the clock', async () => {
    const callbacks: Array<() => void> = [];
    const delayedClock: ProtocolTimerClock = {
      setTimeout: (callback) => callbacks.push(callback),
      clearTimeout: vi.fn(),
    };
    const queue = createQueue();
    const timer = new SerializedProtocolTimer(delayedClock, queue);
    const previous = createOperation();
    const replacement = createOperation();

    timer.schedule(100, previous);
    timer.schedule(100, replacement);
    callbacks[0]!();
    timer.cancel();
    callbacks[1]!();
    await queue(async () => undefined);

    expect(previous.run).not.toHaveBeenCalled();
    expect(replacement.run).not.toHaveBeenCalled();
    expect(delayedClock.clearTimeout).toHaveBeenNthCalledWith(1, 1);
    expect(delayedClock.clearTimeout).toHaveBeenNthCalledWith(2, 2);
  });

  it.each(['synchronous', 'asynchronous'] as const)(
    'reports a %s failure and permits a later operation',
    async (mode) => {
      const timer = new SerializedProtocolTimer(clock, createQueue());
      const failure = new Error('serial drain failed');
      const operation = createOperation();
      operation.run.mockImplementation(() => {
        if (mode === 'synchronous') throw failure;
        return Promise.reject(failure);
      });

      timer.schedule(100, operation);
      await vi.advanceTimersByTimeAsync(100);
      expect(operation.onError).toHaveBeenCalledExactlyOnceWith(failure);

      const next = createOperation();
      timer.schedule(100, next);
      await vi.advanceTimersByTimeAsync(100);
      expect(next.run).toHaveBeenCalledOnce();
    },
  );

  it('keeps cancellation independent for deadlines sharing the same queue', async () => {
    const queue = createQueue();
    const pollTimer = new SerializedProtocolTimer(clock, queue);
    const responseTimer = new SerializedProtocolTimer(clock, queue);
    const poll = createOperation();
    const response = createOperation();

    pollTimer.schedule(100, poll);
    responseTimer.schedule(100, response);
    pollTimer.cancel();
    await vi.advanceTimersByTimeAsync(100);

    expect(poll.run).not.toHaveBeenCalled();
    expect(response.run).toHaveBeenCalledOnce();
  });
});
