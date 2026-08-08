// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RED_DOT_ACK,
  RED_DOT_ENQ,
  RED_DOT_NAK,
  RedDotProtocolSession,
  type RedDotSerialPort,
} from '@/main/modules/connection/infra/usb/reddot/RedDotProtocolSession';

import { validRedDotFrame } from '../../../../../../helpers/redDotFixtures';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

class FakeRedDotPort implements RedDotSerialPort {
  readonly writes: Buffer[] = [];
  private readonly dataListeners = new Set<(chunk: Buffer) => void>();
  private readonly deferredDrains: Array<(error?: Error | null) => void> = [];
  deferDrains = false;
  nextWriteError: Error | null = null;
  nextDrainError: Error | null = null;

  on(_event: 'data', listener: (chunk: Buffer) => void): this {
    this.dataListeners.add(listener);
    return this;
  }

  removeListener(_event: 'data', listener: (chunk: Buffer) => void): this {
    this.dataListeners.delete(listener);
    return this;
  }

  write(data: Buffer, callback: (error?: Error | null) => void): boolean {
    this.writes.push(Buffer.from(data));
    const error = this.nextWriteError;
    this.nextWriteError = null;
    callback(error);
    return true;
  }

  drain(callback: (error?: Error | null) => void): void {
    if (this.deferDrains) {
      this.deferredDrains.push(callback);
      return;
    }
    const error = this.nextDrainError;
    this.nextDrainError = null;
    callback(error);
  }

  emitData(chunk: Buffer): void {
    for (const listener of [...this.dataListeners]) {
      listener(chunk);
    }
  }

  completeNextDrain(error: Error | null = null): void {
    const callback = this.deferredDrains.shift();
    if (!callback) {
      throw new Error('No deferred drain callback');
    }
    callback(error);
  }

  listenerCount(): number {
    return this.dataListeners.size;
  }

  writtenBytes(): number[] {
    return this.writes.flatMap((write) => [...write]);
  }
}

describe('RedDotProtocolSession', () => {
  const sessions: RedDotProtocolSession[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    sessions.forEach((session) => session.stop());
    sessions.length = 0;
    vi.useRealTimers();
  });

  it('sends ENQ first and polls once 300 ms after an idle NAK', async () => {
    const port = new FakeRedDotPort();
    const session = createSession(port);
    await session.start();

    expect(port.writtenBytes()).toEqual([RED_DOT_ENQ]);
    expect(port.writtenBytes()).not.toContain('S'.charCodeAt(0));
    expect(port.writtenBytes()).not.toContain('R'.charCodeAt(0));

    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(299);
    expect(port.writtenBytes()).toEqual([RED_DOT_ENQ]);

    await vi.advanceTimersByTimeAsync(1);
    expect(port.writtenBytes()).toEqual([RED_DOT_ENQ, RED_DOT_ENQ]);
  });

  it('treats repeated device NAK responses as idle without frames or errors', async () => {
    const port = new FakeRedDotPort();
    const onFrame = vi.fn();
    const onConnectionError = vi.fn();
    const session = createSession(port, { onFrame, onConnectionError });
    await session.start();

    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(300);
    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();

    expect(onFrame).not.toHaveBeenCalled();
    expect(onConnectionError).not.toHaveBeenCalled();
    expect(port.writtenBytes()).toEqual([RED_DOT_ENQ, RED_DOT_ENQ]);
  });

  it('emits a valid frame only after ACK drain completes', async () => {
    const port = new FakeRedDotPort();
    const onFrame = vi.fn();
    const session = createSession(port, { onFrame });
    await session.start();
    port.deferDrains = true;

    port.emitData(validRedDotFrame());
    await flushPromises();

    expect(port.writtenBytes()).toEqual([RED_DOT_ENQ, RED_DOT_ACK]);
    expect(onFrame).not.toHaveBeenCalled();

    port.completeNextDrain();
    await flushPromises();
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('NAKs an invalid BCC and recovers on the next valid frame', async () => {
    const port = new FakeRedDotPort();
    const onFrame = vi.fn();
    const session = createSession(port, { onFrame });
    await session.start();
    const malformed = validRedDotFrame();
    malformed[57] = malformed[57]! ^ 0x01;

    port.emitData(malformed);
    await flushPromises();
    expect(port.writtenBytes()).toEqual([RED_DOT_ENQ, RED_DOT_NAK]);
    expect(onFrame).not.toHaveBeenCalled();

    port.emitData(validRedDotFrame());
    await flushPromises();
    expect(port.writtenBytes()).toEqual([RED_DOT_ENQ, RED_DOT_NAK, RED_DOT_ACK]);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('does not send a duplicate ENQ while awaiting a response', async () => {
    const port = new FakeRedDotPort();
    const session = createSession(port);
    await session.start();

    await vi.advanceTimersByTimeAsync(299);

    expect(port.writtenBytes()).toEqual([RED_DOT_ENQ]);
    expect(session.getState()).toBe('AWAITING_RESPONSE');
  });

  it('removes its listener and cancels polling when stopped', async () => {
    const port = new FakeRedDotPort();
    const session = createSession(port);
    await session.start();
    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();

    session.stop();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(port.listenerCount()).toBe(0);
    expect(port.writtenBytes()).toEqual([RED_DOT_ENQ]);
    expect(session.getState()).toBe('STOPPED');
  });

  it('keeps one listener and one active timer generation across reconnect-style restarts', async () => {
    const port = new FakeRedDotPort();
    const session = createSession(port);
    await session.start();
    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();

    session.stop();
    await session.start();
    expect(port.listenerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(300);

    // The old scheduled poll was cancelled; only the new start sent an ENQ.
    expect(port.writtenBytes()).toEqual([RED_DOT_ENQ, RED_DOT_ENQ]);
  });

  it('does not emit a frame when ACK drain fails and reports a connection error', async () => {
    const port = new FakeRedDotPort();
    const onFrame = vi.fn();
    const onConnectionError = vi.fn();
    const session = createSession(port, { onFrame, onConnectionError });
    await session.start();
    port.nextDrainError = new Error('drain failed');

    port.emitData(validRedDotFrame());
    await flushPromises();

    expect(onFrame).not.toHaveBeenCalled();
    expect(onConnectionError).toHaveBeenCalledTimes(1);
    expect(session.getState()).toBe('STOPPED');
  });

  function createSession(
    port: FakeRedDotPort,
    overrides: Partial<{
      onFrame: (frame: Buffer, receivedAt: Date) => void;
      onConnectionError: (error: Error) => void;
    }> = {},
  ): RedDotProtocolSession {
    const session = new RedDotProtocolSession(port, {
      onFrame: overrides.onFrame ?? vi.fn(),
      onConnectionError: overrides.onConnectionError ?? vi.fn(),
    });
    sessions.push(session);
    return session;
  }

  async function flushPromises(): Promise<void> {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
  }
});
