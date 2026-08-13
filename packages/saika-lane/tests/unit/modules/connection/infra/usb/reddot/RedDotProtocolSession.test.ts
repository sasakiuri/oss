// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RED_DOT_ACK,
  RED_DOT_ENQ,
  RED_DOT_NAK,
  RED_DOT_PISTOL_TARGET_TYPE,
  RED_DOT_RIFLE_TARGET_TYPE,
  RED_DOT_SET_TARGET_TYPE_COMMAND,
  RedDotProtocolSession,
  type RedDotProtocolSessionOptions,
  type RedDotSerialPort,
} from '@/main/modules/connection/infra/usb/reddot/RedDotProtocolSession';

import { validRedDotFrame } from '../../../../../../helpers/redDotFixtures';

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => logger,
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
}

describe('RedDotProtocolSession', () => {
  const sessions: RedDotProtocolSession[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessions.forEach((session) => session.stop());
    sessions.length = 0;
    vi.useRealTimers();
  });

  it('probes with ENQ first, formally configures Rifle, and records the selected path', async () => {
    const port = new FakeRedDotPort();
    const session = createSession(port);
    const startPromise = session.start();
    await flushPromises();

    expect(port.writes).toEqual([Buffer.from([RED_DOT_ENQ])]);
    expect(session.getState()).toBe('AWAITING_PROBE_RESPONSE');

    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();
    expect(port.writes).toEqual([Buffer.from([RED_DOT_ENQ]), Buffer.from(RED_DOT_SET_TARGET_TYPE_COMMAND)]);
    expect(session.getState()).toBe('AWAITING_TARGET_TYPE_ACK');

    port.emitData(Buffer.from([RED_DOT_ACK]));
    await startPromise;

    expect(port.writes).toEqual([
      Buffer.from([RED_DOT_ENQ]),
      Buffer.from(RED_DOT_SET_TARGET_TYPE_COMMAND),
      Buffer.from([RED_DOT_RIFLE_TARGET_TYPE]),
    ]);
    expect(session.getInitializationMode()).toBe('FORMAL');
    expect(session.getState()).toBe('POLL_SCHEDULED');
    expect(logger.info).toHaveBeenCalledWith(
      '[RedDot] Target type configured; ENQ polling enabled',
      'usb',
      expect.objectContaining({
        code: 'RED_DOT_TARGET_TYPE_CONFIGURED',
        targetType: 'RIFLE',
        targetTypeByte: RED_DOT_RIFLE_TARGET_TYPE,
        initializationMode: 'FORMAL',
      }),
    );

    await vi.advanceTimersByTimeAsync(99);
    expect(port.writes).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(port.writes.at(-1)).toEqual(Buffer.from([RED_DOT_ENQ]));

    const writtenBytes = port.writes.flatMap((write) => [...write]);
    expect(writtenBytes).not.toContain('S'.charCodeAt(0));
    expect(writtenBytes).not.toContain('R'.charCodeAt(0));
  });

  it('writes target type 00 for the Pistol profile', async () => {
    const port = new FakeRedDotPort();
    const session = createSession(port, { targetType: 'PISTOL' });

    await startFormally(port, session);

    expect(port.writes).toEqual([
      Buffer.from([RED_DOT_ENQ]),
      Buffer.from(RED_DOT_SET_TARGET_TYPE_COMMAND),
      Buffer.from([RED_DOT_PISTOL_TARGET_TYPE]),
    ]);
    expect(session.getInitializationMode()).toBe('FORMAL');
  });

  it('attempts formal initialization after an unanswered initial probe', async () => {
    const port = new FakeRedDotPort();
    const session = createSession(port);
    const startPromise = session.start();
    await flushPromises();

    await vi.advanceTimersByTimeAsync(299);
    expect(port.writes).toEqual([Buffer.from([RED_DOT_ENQ])]);

    await vi.advanceTimersByTimeAsync(1);
    expect(port.writes).toEqual([Buffer.from([RED_DOT_ENQ]), Buffer.from(RED_DOT_SET_TARGET_TYPE_COMMAND)]);
    expect(logger.warn).toHaveBeenCalledWith(
      '[RedDot] Initial ENQ probe timed out; attempting target-type initialization',
      'usb',
      expect.objectContaining({ code: 'PROBE_RESPONSE_TIMEOUT', targetType: 'RIFLE' }),
    );

    port.emitData(Buffer.from([RED_DOT_ACK]));
    await startPromise;
    expect(session.getInitializationMode()).toBe('FORMAL');
  });

  it('does not mistake a NAK during target-type initialization for poll idle', async () => {
    const port = new FakeRedDotPort();
    const session = createSession(port);
    const startPromise = session.start();
    await flushPromises();

    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();
    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();

    expect(session.getState()).toBe('AWAITING_TARGET_TYPE_ACK');
    expect(port.writes).toEqual([Buffer.from([RED_DOT_ENQ]), Buffer.from(RED_DOT_SET_TARGET_TYPE_COMMAND)]);

    port.emitData(Buffer.from([RED_DOT_ACK]));
    await startPromise;
  });

  it('falls back to legacy Rifle polling after one formal ACK timeout and records a warning', async () => {
    const port = new FakeRedDotPort();
    const onWarning = vi.fn();
    const session = createSession(port, { onWarning });
    let ready = false;
    const startPromise = session.start().then(() => {
      ready = true;
    });
    await flushPromises();

    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(499);
    expect(port.writes).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(port.writes).toEqual([
      Buffer.from([RED_DOT_ENQ]),
      Buffer.from(RED_DOT_SET_TARGET_TYPE_COMMAND),
      Buffer.from([RED_DOT_RIFLE_TARGET_TYPE]),
    ]);
    expect(session.getState()).toBe('FALLBACK_SETTLING');
    expect(ready).toBe(false);

    await vi.advanceTimersByTimeAsync(499);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await startPromise;

    expect(session.getInitializationMode()).toBe('LEGACY_RIFLE_FALLBACK');
    expect(session.getState()).toBe('POLL_SCHEDULED');
    expect(onWarning).toHaveBeenCalledWith('RIFLE_LEGACY_POLLING_FALLBACK');
    expect(logger.warn).toHaveBeenCalledWith(
      '[RedDot] Rifle target-type ACK was not confirmed; legacy ENQ polling fallback is active',
      'usb',
      expect.objectContaining({
        code: 'RIFLE_LEGACY_POLLING_FALLBACK',
        reason: 'TARGET_TYPE_ACK_TIMEOUT',
        targetType: 'RIFLE',
      }),
    );
    expect(port.writes.filter((write) => write.equals(Buffer.from(RED_DOT_SET_TARGET_TYPE_COMMAND)))).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(port.writes.at(-1)).toEqual(Buffer.from([RED_DOT_ENQ]));
  });

  it('absorbs a delayed command ACK during Rifle fallback settling', async () => {
    const port = new FakeRedDotPort();
    const session = createSession(port);
    const startPromise = session.start();
    await flushPromises();

    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(500);
    expect(session.getState()).toBe('FALLBACK_SETTLING');

    port.emitData(Buffer.from([RED_DOT_ACK]));
    await flushPromises();
    expect(session.getState()).toBe('FALLBACK_SETTLING');
    expect(port.writes).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(500);
    await startPromise;
    expect(session.getInitializationMode()).toBe('LEGACY_RIFLE_FALLBACK');
  });

  it('fails Pistol initialization instead of using a potentially mis-scored legacy path', async () => {
    const port = new FakeRedDotPort();
    const session = createSession(port, { targetType: 'PISTOL' });
    const outcomePromise = session.start().then(
      () => null,
      (error: unknown) => error,
    );
    await flushPromises();

    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(500);
    const error = await outcomePromise;

    expect(error).toMatchObject({
      code: 'RED_DOT_INITIALIZATION_FAILED',
      metadata: { reason: 'TARGET_TYPE_ACK_TIMEOUT', targetType: 'PISTOL' },
    });
    expect(session.getState()).toBe('STOPPED');
    expect(port.writes).toEqual([Buffer.from([RED_DOT_ENQ]), Buffer.from(RED_DOT_SET_TARGET_TYPE_COMMAND)]);
    expect(logger.error).toHaveBeenCalledWith(
      '[RedDot] Pistol target-type initialization failed; legacy polling is disabled',
      'usb',
      expect.objectContaining({ code: 'RED_DOT_INITIALIZATION_FAILED', targetType: 'PISTOL' }),
    );
  });

  it('ACKs but drops a shot received before target-type initialization', async () => {
    const port = new FakeRedDotPort();
    const onFrame = vi.fn();
    const session = createSession(port, { onFrame });
    const startPromise = session.start();
    await flushPromises();

    port.emitData(validRedDotFrame());
    await flushPromises();

    expect(port.writes).toEqual([
      Buffer.from([RED_DOT_ENQ]),
      Buffer.from([RED_DOT_ACK]),
      Buffer.from(RED_DOT_SET_TARGET_TYPE_COMMAND),
    ]);
    expect(onFrame).not.toHaveBeenCalled();
    expect(session.getState()).toBe('AWAITING_TARGET_TYPE_ACK');
    expect(logger.warn).toHaveBeenCalledWith(
      '[RedDot] Shot received before target-type initialization was dropped',
      'usb',
      expect.objectContaining({ code: 'FRAME_BEFORE_TARGET_TYPE_DROPPED', targetType: 'RIFLE' }),
    );

    port.emitData(Buffer.from([RED_DOT_ACK]));
    await startPromise;
  });

  it('treats repeated device NAK responses as idle after initialization', async () => {
    const port = new FakeRedDotPort();
    const onFrame = vi.fn();
    const onConnectionError = vi.fn();
    const session = createSession(port, { onFrame, onConnectionError });
    await startFormally(port, session);
    await vi.advanceTimersByTimeAsync(100);

    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(100);
    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();

    expect(onFrame).not.toHaveBeenCalled();
    expect(onConnectionError).not.toHaveBeenCalled();
    expect(port.writes).toEqual([
      Buffer.from([RED_DOT_ENQ]),
      Buffer.from(RED_DOT_SET_TARGET_TYPE_COMMAND),
      Buffer.from([RED_DOT_RIFLE_TARGET_TYPE]),
      Buffer.from([RED_DOT_ENQ]),
      Buffer.from([RED_DOT_ENQ]),
    ]);
  });

  it('ignores an ACK that arrives after target-type initialization', async () => {
    const port = new FakeRedDotPort();
    const onWarning = vi.fn();
    const session = createSession(port, { onWarning });
    await startFormally(port, session);

    port.emitData(Buffer.from([RED_DOT_ACK]));
    await flushPromises();

    expect(session.getState()).toBe('POLL_SCHEDULED');
    expect(port.writes).toHaveLength(3);
    expect(onWarning).not.toHaveBeenCalled();
  });

  it('emits a valid frame only after ACK drain completes', async () => {
    const port = new FakeRedDotPort();
    const onFrame = vi.fn();
    const session = createSession(port, { onFrame });
    await startFormally(port, session);
    port.deferDrains = true;

    port.emitData(validRedDotFrame());
    await flushPromises();

    expect(port.writes.at(-1)).toEqual(Buffer.from([RED_DOT_ACK]));
    expect(onFrame).not.toHaveBeenCalled();

    port.completeNextDrain();
    await flushPromises();
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('accepts an unsolicited frame after initialization and reschedules polling from it', async () => {
    const port = new FakeRedDotPort();
    const onFrame = vi.fn();
    const session = createSession(port, { onFrame });
    await startFormally(port, session);
    await vi.advanceTimersByTimeAsync(50);

    port.emitData(validRedDotFrame());
    await flushPromises();

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(port.writes.at(-1)).toEqual(Buffer.from([RED_DOT_ACK]));
    await vi.advanceTimersByTimeAsync(99);
    expect(port.writes.filter((write) => write.equals(Buffer.from([RED_DOT_ENQ])))).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(port.writes.at(-1)).toEqual(Buffer.from([RED_DOT_ENQ]));
  });

  it('NAKs an invalid BCC and recovers on the next valid frame', async () => {
    const port = new FakeRedDotPort();
    const onFrame = vi.fn();
    const session = createSession(port, { onFrame });
    await startFormally(port, session);
    await vi.advanceTimersByTimeAsync(100);
    const malformed = validRedDotFrame();
    malformed[57] = malformed[57]! ^ 0x01;

    port.emitData(malformed);
    await flushPromises();
    expect(port.writes.at(-1)).toEqual(Buffer.from([RED_DOT_NAK]));
    expect(onFrame).not.toHaveBeenCalled();

    port.emitData(validRedDotFrame());
    await flushPromises();
    expect(port.writes.at(-1)).toEqual(Buffer.from([RED_DOT_ACK]));
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('does not send a duplicate ENQ while awaiting a response', async () => {
    const port = new FakeRedDotPort();
    const session = createSession(port);
    await startFormally(port, session);
    await vi.advanceTimersByTimeAsync(100);

    await vi.advanceTimersByTimeAsync(299);

    expect(port.writes.filter((write) => write.equals(Buffer.from([RED_DOT_ENQ])))).toHaveLength(2);
    expect(session.getState()).toBe('AWAITING_RESPONSE');
  });

  it('removes its listener and cancels pending initialization when stopped', async () => {
    const port = new FakeRedDotPort();
    const session = createSession(port);
    const outcomePromise = session.start().then(
      () => null,
      (error: unknown) => error,
    );
    await flushPromises();

    session.stop();
    const error = await outcomePromise;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(error).toMatchObject({ code: 'CONNECTION_FAILED' });
    expect(port.listenerCount()).toBe(0);
    expect(port.writes).toEqual([Buffer.from([RED_DOT_ENQ])]);
    expect(session.getState()).toBe('STOPPED');
  });

  it('keeps one listener and one timer generation across reconnect-style restarts', async () => {
    const port = new FakeRedDotPort();
    const session = createSession(port);
    const firstOutcome = session.start().catch((error: unknown) => error);
    await flushPromises();

    session.stop();
    await firstOutcome;
    const secondStart = session.start();
    await flushPromises();
    expect(port.listenerCount()).toBe(1);

    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();
    port.emitData(Buffer.from([RED_DOT_ACK]));
    await secondStart;
    await vi.advanceTimersByTimeAsync(100);

    expect(port.writes).toEqual([
      Buffer.from([RED_DOT_ENQ]),
      Buffer.from([RED_DOT_ENQ]),
      Buffer.from(RED_DOT_SET_TARGET_TYPE_COMMAND),
      Buffer.from([RED_DOT_RIFLE_TARGET_TYPE]),
      Buffer.from([RED_DOT_ENQ]),
    ]);
  });

  it('does not emit a frame when ACK drain fails and reports an established connection error', async () => {
    const port = new FakeRedDotPort();
    const onFrame = vi.fn();
    const onConnectionError = vi.fn();
    const session = createSession(port, { onFrame, onConnectionError });
    await startFormally(port, session);
    port.nextDrainError = new Error('drain failed');

    port.emitData(validRedDotFrame());
    await flushPromises();

    expect(onFrame).not.toHaveBeenCalled();
    expect(onConnectionError).toHaveBeenCalledTimes(1);
    expect(session.getState()).toBe('STOPPED');
  });

  it('rejects startup when the target-type payload write fails', async () => {
    const port = new FakeRedDotPort();
    const onConnectionError = vi.fn();
    const session = createSession(port, { onConnectionError });
    const outcomePromise = session.start().then(
      () => null,
      (error: unknown) => error,
    );
    await flushPromises();

    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();
    port.nextWriteError = new Error('target type failed');
    port.emitData(Buffer.from([RED_DOT_ACK]));
    const error = await outcomePromise;

    expect(error).toMatchObject({ code: 'USB_WRITE_FAILED' });
    expect(onConnectionError).not.toHaveBeenCalled();
    expect(session.getState()).toBe('STOPPED');
  });

  it('rejects startup and removes the listener when the initial ENQ write fails', async () => {
    const port = new FakeRedDotPort();
    port.nextWriteError = new Error('probe failed');
    const session = createSession(port);

    await expect(session.start()).rejects.toMatchObject({ code: 'USB_WRITE_FAILED' });

    expect(session.getState()).toBe('STOPPED');
    expect(port.listenerCount()).toBe(0);
  });

  function createSession(
    port: FakeRedDotPort,
    overrides: Partial<RedDotProtocolSessionOptions> = {},
  ): RedDotProtocolSession {
    const session = new RedDotProtocolSession(port, {
      targetType: overrides.targetType ?? 'RIFLE',
      initializationTimeoutMs: overrides.initializationTimeoutMs,
      fallbackSettleMs: overrides.fallbackSettleMs,
      pollIntervalMs: overrides.pollIntervalMs,
      responseTimeoutMs: overrides.responseTimeoutMs,
      maxBufferBytes: overrides.maxBufferBytes,
      maxInvalidResponsesPerPoll: overrides.maxInvalidResponsesPerPoll,
      clock: overrides.clock,
      onFrame: overrides.onFrame ?? vi.fn(),
      onConnectionError: overrides.onConnectionError ?? vi.fn(),
      onWarning: overrides.onWarning,
    });
    sessions.push(session);
    return session;
  }

  async function startFormally(port: FakeRedDotPort, session: RedDotProtocolSession): Promise<void> {
    const startPromise = session.start();
    await flushPromises();
    port.emitData(Buffer.from([RED_DOT_NAK]));
    await flushPromises();
    port.emitData(Buffer.from([RED_DOT_ACK]));
    await startPromise;
  }

  async function flushPromises(): Promise<void> {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
  }
});
