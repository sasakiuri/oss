// SPDX-License-Identifier: MIT
import type { DisagRedDotTargetType } from '@/main/modules/target/domain/targetDeviceDefinitions';
import {
  type RedDotStreamEvent,
  RedDotStreamScanner,
} from '@/main/modules/target/infra/parsers/disag/RedDotStreamScanner';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

export const RED_DOT_ENQ = 0x05;
export const RED_DOT_ACK = 0x06;
export const RED_DOT_NAK = 0x15;
export const RED_DOT_SET_TARGET_TYPE_COMMAND = [0x11, 0x00, 0x01] as const;
export const RED_DOT_RIFLE_TARGET_TYPE = 0x01;
export const RED_DOT_PISTOL_TARGET_TYPE = 0x00;

export type RedDotProtocolState =
  | 'STOPPED'
  | 'PROBING'
  | 'AWAITING_PROBE_RESPONSE'
  | 'INITIALIZING_TARGET_TYPE'
  | 'AWAITING_TARGET_TYPE_ACK'
  | 'FALLBACK_SETTLING'
  | 'POLL_SCHEDULED'
  | 'AWAITING_RESPONSE'
  | 'WRITING_REPLY';

export type RedDotInitializationMode = 'FORMAL' | 'LEGACY_RIFLE_FALLBACK';

export interface RedDotSerialPort {
  on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  removeListener(event: 'data', listener: (chunk: Buffer) => void): unknown;
  write(data: Buffer, callback: (error?: Error | null) => void): unknown;
  drain(callback: (error?: Error | null) => void): unknown;
}

export interface RedDotProtocolClock {
  now(): Date;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RedDotProtocolSessionOptions {
  readonly targetType: DisagRedDotTargetType;
  readonly initializationTimeoutMs?: number;
  readonly fallbackSettleMs?: number;
  readonly pollIntervalMs?: number;
  readonly responseTimeoutMs?: number;
  readonly maxBufferBytes?: number;
  readonly maxInvalidResponsesPerPoll?: number;
  readonly clock?: RedDotProtocolClock;
  readonly onFrame: (frame: Buffer, receivedAt: Date) => void;
  readonly onConnectionError?: (error: Error) => void;
  readonly onWarning?: (code: string) => void;
}

interface Readiness {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  settled: boolean;
}

const defaultClock: RedDotProtocolClock = {
  now: () => new Date(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Owns the RedDot link probe, target-type handshake, ENQ polling, and ACK/NAK
 * reply state machine for one open port.
 */
export class RedDotProtocolSession {
  private readonly initializationTimeoutMs: number;
  private readonly fallbackSettleMs: number;
  private readonly pollIntervalMs: number;
  private readonly responseTimeoutMs: number;
  private readonly maxInvalidResponsesPerPoll: number;
  private readonly clock: RedDotProtocolClock;
  private readonly scanner: RedDotStreamScanner;
  private state: RedDotProtocolState = 'STOPPED';
  private running = false;
  private initialized = false;
  private initializationMode: RedDotInitializationMode | null = null;
  private generation = 0;
  private invalidResponseCount = 0;
  private pollTimer: unknown = null;
  private responseTimer: unknown = null;
  private pollTimerGeneration = 0;
  private responseTimerGeneration = 0;
  private readiness: Readiness | null = null;
  private operationQueue: Promise<void> = Promise.resolve();
  private receiptSequence = 0;
  private lastPreInitializationReceiptSequence = Number.POSITIVE_INFINITY;
  private lastReceiptBeforeTargetTypeCommand = Number.POSITIVE_INFINITY;

  private readonly dataListener = (chunk: Buffer): void => {
    const generation = this.generation;
    const receiptSequence = ++this.receiptSequence;
    void this.runSerialized(() => this.handleChunk(chunk, generation, receiptSequence)).catch((error: unknown) => {
      this.handleConnectionFailure(error, generation);
    });
  };

  constructor(
    private readonly port: RedDotSerialPort,
    private readonly options: RedDotProtocolSessionOptions,
  ) {
    this.initializationTimeoutMs = options.initializationTimeoutMs ?? 500;
    this.fallbackSettleMs = options.fallbackSettleMs ?? 500;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.responseTimeoutMs = options.responseTimeoutMs ?? 300;
    this.maxInvalidResponsesPerPoll = options.maxInvalidResponsesPerPoll ?? 3;
    this.clock = options.clock ?? defaultClock;
    this.scanner = new RedDotStreamScanner({
      maxBufferBytes: options.maxBufferBytes ?? 4096,
      now: () => this.clock.now(),
    });
  }

  async start(): Promise<void> {
    if (this.running) {
      this.stop();
    }

    this.generation += 1;
    const generation = this.generation;
    this.running = true;
    this.state = 'STOPPED';
    this.initialized = false;
    this.initializationMode = null;
    this.invalidResponseCount = 0;
    this.receiptSequence = 0;
    this.lastPreInitializationReceiptSequence = Number.POSITIVE_INFINITY;
    this.lastReceiptBeforeTargetTypeCommand = Number.POSITIVE_INFINITY;
    this.scanner.clear();
    this.operationQueue = Promise.resolve();
    const readiness = this.createReadiness();
    this.readiness = readiness;
    this.port.on('data', this.dataListener);

    try {
      // Observe readiness from the beginning of the probe. stop() may reject it
      // while write/drain is still pending, and waiting for the probe first would
      // leave that rejection temporarily unhandled and delay cancellation.
      await Promise.all([this.runSerialized(() => this.beginProbe(generation)), readiness.promise]);
    } catch (error) {
      if (this.isActive(generation)) {
        this.stopInternal();
      }
      throw error;
    } finally {
      if (this.readiness === readiness) {
        this.readiness = null;
      }
    }
  }

  stop(): void {
    this.rejectReadiness(
      ErrorCatalog.createError('CONNECTION_FAILED', {
        reason: 'RedDot protocol initialization was cancelled',
      }),
    );
    this.stopInternal();
  }

  getState(): RedDotProtocolState {
    return this.state;
  }

  getInitializationMode(): RedDotInitializationMode | null {
    return this.initializationMode;
  }

  private createReadiness(): Readiness {
    let resolvePromise!: () => void;
    let rejectPromise!: (error: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const readiness: Readiness = {
      promise,
      settled: false,
      resolve: () => {
        if (!readiness.settled) {
          readiness.settled = true;
          resolvePromise();
        }
      },
      reject: (error) => {
        if (!readiness.settled) {
          readiness.settled = true;
          rejectPromise(error);
        }
      },
    };
    return readiness;
  }

  private runSerialized(operation: () => Promise<void>): Promise<void> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.catch(() => undefined);
    return result;
  }

  private async beginProbe(generation: number): Promise<void> {
    if (!this.isActive(generation)) {
      return;
    }

    this.clearPollTimer();
    this.clearResponseTimer();
    this.state = 'PROBING';
    await this.writeAndDrain(Buffer.from([RED_DOT_ENQ]), 'PROBE_ENQ', generation);

    if (!this.isActive(generation)) {
      return;
    }

    this.state = 'AWAITING_PROBE_RESPONSE';
    this.startProbeTimer(generation);
  }

  private async beginTargetTypeInitialization(generation: number): Promise<void> {
    if (!this.isActive(generation)) {
      return;
    }

    this.clearPollTimer();
    this.clearResponseTimer();
    this.state = 'INITIALIZING_TARGET_TYPE';
    this.lastReceiptBeforeTargetTypeCommand = this.receiptSequence;
    await this.writeAndDrain(Buffer.from(RED_DOT_SET_TARGET_TYPE_COMMAND), 'SET_TARGET_TYPE', generation);

    if (!this.isActive(generation)) {
      return;
    }

    this.state = 'AWAITING_TARGET_TYPE_ACK';
    this.startInitializationTimer(generation);
  }

  private async beginRifleFallback(generation: number, reason: string): Promise<void> {
    if (!this.isActive(generation)) {
      return;
    }

    this.clearResponseTimer();
    this.state = 'INITIALIZING_TARGET_TYPE';

    // If the command was accepted but its ACK was lost, the target may still be
    // waiting for this byte. Sending the expected Rifle value once closes that
    // state without risking a second DC1 command being consumed as the value.
    await this.writeAndDrain(Buffer.from([RED_DOT_RIFLE_TARGET_TYPE]), 'RIFLE_FALLBACK_SYNC', generation);

    if (!this.isActive(generation)) {
      return;
    }

    this.state = 'FALLBACK_SETTLING';
    this.startFallbackSettleTimer(generation, reason);
  }

  private async beginPoll(generation: number): Promise<void> {
    if (!this.isActive(generation) || !this.initialized) {
      return;
    }

    this.clearPollTimer();
    this.clearResponseTimer();
    await this.writeAndDrain(Buffer.from([RED_DOT_ENQ]), 'ENQ', generation);

    if (!this.isActive(generation)) {
      return;
    }

    this.state = 'AWAITING_RESPONSE';
    this.startResponseTimer(generation);
  }

  private async handleChunk(chunk: Buffer, generation: number, receiptSequence: number): Promise<void> {
    if (!this.isActive(generation)) {
      return;
    }

    const events = this.scanner.push(chunk, receiptSequence);
    for (const event of events) {
      if (!this.isActive(generation)) {
        return;
      }
      const shouldContinue = await this.handleStreamEvent(event, generation);
      if (!shouldContinue) {
        return;
      }
    }
  }

  private async handleStreamEvent(event: RedDotStreamEvent, generation: number): Promise<boolean> {
    switch (event.type) {
      case 'ack':
        await this.handleAck(event, generation);
        return true;
      case 'idle':
        await this.handleIdle(generation);
        return true;
      case 'noise':
        this.warn('STREAM_NOISE', { byteCount: event.byteCount });
        return true;
      case 'overflow':
        this.warn('BUFFER_OVERFLOW', { byteCount: event.droppedByteCount });
        return true;
      case 'invalid-structure':
      case 'invalid-frame':
        return this.rejectFrame(event, generation);
      case 'frame':
        await this.acceptFrame(event, generation);
        return true;
    }
  }

  private async handleAck(event: Extract<RedDotStreamEvent, { type: 'ack' }>, generation: number): Promise<void> {
    if (
      this.state !== 'AWAITING_TARGET_TYPE_ACK' ||
      event.receivedAtReceiptSequence <= this.lastReceiptBeforeTargetTypeCommand
    ) {
      return;
    }

    this.clearResponseTimer();
    this.state = 'INITIALIZING_TARGET_TYPE';
    const targetTypeByte = this.options.targetType === 'RIFLE' ? RED_DOT_RIFLE_TARGET_TYPE : RED_DOT_PISTOL_TARGET_TYPE;
    await this.writeAndDrain(Buffer.from([targetTypeByte]), `TARGET_TYPE_${this.options.targetType}`, generation);

    if (!this.isActive(generation)) {
      return;
    }

    this.completeInitialization('FORMAL', generation);
  }

  private async handleIdle(generation: number): Promise<void> {
    if (this.initialized) {
      this.schedulePoll(generation);
      return;
    }

    if (this.state === 'AWAITING_PROBE_RESPONSE') {
      this.clearResponseTimer();
      await this.beginTargetTypeInitialization(generation);
    }
  }

  private async rejectFrame(
    event: Extract<RedDotStreamEvent, { type: 'invalid-structure' | 'invalid-frame' }>,
    generation: number,
  ): Promise<boolean> {
    const previousState = this.state;
    const wasInitialized = this.wasInitializedWhenCandidateStarted(event.startedAtReceiptSequence);
    this.clearPollTimer();
    if (wasInitialized || previousState === 'AWAITING_PROBE_RESPONSE') {
      this.clearResponseTimer();
    }
    this.invalidResponseCount += 1;
    this.warn(event.error.code, event.error.offset === undefined ? {} : { offset: event.error.offset });
    this.state = 'WRITING_REPLY';
    await this.writeAndDrain(Buffer.from([RED_DOT_NAK]), 'NAK', generation);

    if (!this.isActive(generation)) {
      return false;
    }

    if (!wasInitialized) {
      const reachedInvalidResponseLimit = this.invalidResponseCount >= this.maxInvalidResponsesPerPoll;
      if (reachedInvalidResponseLimit) {
        this.scanner.clear();
        this.invalidResponseCount = 0;
      }
      if (this.initialized) {
        this.schedulePoll(generation);
        return !reachedInvalidResponseLimit;
      }
      await this.resumeInitializationAfterReply(previousState, generation);
      return !reachedInvalidResponseLimit;
    }

    if (this.invalidResponseCount >= this.maxInvalidResponsesPerPoll) {
      this.scanner.clear();
      this.schedulePoll(generation);
      return false;
    }

    this.state = 'AWAITING_RESPONSE';
    this.startResponseTimer(generation);
    return true;
  }

  private async acceptFrame(event: Extract<RedDotStreamEvent, { type: 'frame' }>, generation: number): Promise<void> {
    const previousState = this.state;
    const wasInitialized = this.wasInitializedWhenCandidateStarted(event.startedAtReceiptSequence);
    this.clearPollTimer();
    if (wasInitialized || previousState === 'AWAITING_PROBE_RESPONSE') {
      this.clearResponseTimer();
    }
    this.state = 'WRITING_REPLY';
    await this.writeAndDrain(Buffer.from([RED_DOT_ACK]), 'ACK', generation);

    if (!this.isActive(generation)) {
      return;
    }

    if (!wasInitialized) {
      this.warn(
        'FRAME_BEFORE_TARGET_TYPE_DROPPED',
        { targetType: this.options.targetType, state: previousState },
        '[RedDot] Shot received before target-type initialization was dropped',
      );
      if (this.initialized) {
        this.schedulePoll(generation);
        return;
      }
      await this.resumeInitializationAfterReply(previousState, generation);
      return;
    }

    try {
      this.options.onFrame(Buffer.from(event.frame), new Date(event.receivedAt.getTime()));
    } catch {
      this.warn('FRAME_CALLBACK_FAILED');
    }
    this.schedulePoll(generation);
  }

  private async resumeInitializationAfterReply(previousState: RedDotProtocolState, generation: number): Promise<void> {
    switch (previousState) {
      case 'AWAITING_PROBE_RESPONSE':
        await this.beginTargetTypeInitialization(generation);
        return;
      case 'AWAITING_TARGET_TYPE_ACK':
        this.state = 'AWAITING_TARGET_TYPE_ACK';
        return;
      case 'FALLBACK_SETTLING':
        this.state = 'FALLBACK_SETTLING';
        return;
      default:
        await this.beginTargetTypeInitialization(generation);
    }
  }

  private completeInitialization(mode: RedDotInitializationMode, generation: number): void {
    if (!this.isActive(generation)) {
      return;
    }

    // A serial chunk can be queued while the target-type byte is still being
    // drained. Frames that started in any chunk received up to this point must
    // remain pre-initialization frames even when they are parsed later.
    this.lastPreInitializationReceiptSequence = this.receiptSequence;
    this.initialized = true;
    this.initializationMode = mode;
    this.invalidResponseCount = 0;

    if (mode === 'FORMAL') {
      getLogger().info('[RedDot] Target type configured; ENQ polling enabled', 'usb', {
        code: 'RED_DOT_TARGET_TYPE_CONFIGURED',
        targetType: this.options.targetType,
        targetTypeByte: this.options.targetType === 'RIFLE' ? RED_DOT_RIFLE_TARGET_TYPE : RED_DOT_PISTOL_TARGET_TYPE,
        initializationMode: mode,
        pollIntervalMs: this.pollIntervalMs,
      });
    }

    this.schedulePoll(generation);
    this.resolveReadiness();
  }

  private wasInitializedWhenCandidateStarted(startedAtReceiptSequence: number): boolean {
    return this.initialized && startedAtReceiptSequence > this.lastPreInitializationReceiptSequence;
  }

  private schedulePoll(generation: number): void {
    if (!this.isActive(generation) || !this.initialized) {
      return;
    }

    this.clearPollTimer();
    this.clearResponseTimer();
    this.invalidResponseCount = 0;
    this.state = 'POLL_SCHEDULED';
    const timerGeneration = this.pollTimerGeneration;
    this.pollTimer = this.clock.setTimeout(() => {
      if (timerGeneration !== this.pollTimerGeneration) {
        return;
      }
      this.pollTimer = null;
      void this.runSerialized(async () => {
        if (timerGeneration !== this.pollTimerGeneration || this.state !== 'POLL_SCHEDULED') {
          return;
        }
        await this.beginPoll(generation);
      }).catch((error: unknown) => {
        this.handleConnectionFailure(error, generation);
      });
    }, this.pollIntervalMs);
  }

  private startProbeTimer(generation: number): void {
    this.clearResponseTimer();
    const timerGeneration = this.responseTimerGeneration;
    this.responseTimer = this.clock.setTimeout(() => {
      if (timerGeneration !== this.responseTimerGeneration) {
        return;
      }
      this.responseTimer = null;
      void this.runSerialized(async () => {
        if (
          timerGeneration !== this.responseTimerGeneration ||
          !this.isActive(generation) ||
          this.state !== 'AWAITING_PROBE_RESPONSE'
        ) {
          return;
        }
        this.scanner.clear();
        this.warn(
          'PROBE_RESPONSE_TIMEOUT',
          { timeoutMs: this.responseTimeoutMs, targetType: this.options.targetType },
          '[RedDot] Initial ENQ probe timed out; attempting target-type initialization',
        );
        await this.beginTargetTypeInitialization(generation);
      }).catch((error: unknown) => {
        this.handleConnectionFailure(error, generation);
      });
    }, this.responseTimeoutMs);
  }

  private startResponseTimer(generation: number): void {
    this.clearResponseTimer();
    const timerGeneration = this.responseTimerGeneration;
    this.responseTimer = this.clock.setTimeout(() => {
      if (timerGeneration !== this.responseTimerGeneration) {
        return;
      }
      this.responseTimer = null;
      void this.runSerialized(async () => {
        if (
          timerGeneration !== this.responseTimerGeneration ||
          !this.isActive(generation) ||
          this.state !== 'AWAITING_RESPONSE'
        ) {
          return;
        }
        this.scanner.clear();
        this.warn('RESPONSE_TIMEOUT');
        this.schedulePoll(generation);
      }).catch((error: unknown) => {
        this.handleConnectionFailure(error, generation);
      });
    }, this.responseTimeoutMs);
  }

  private startInitializationTimer(generation: number): void {
    this.clearResponseTimer();
    const timerGeneration = this.responseTimerGeneration;
    this.responseTimer = this.clock.setTimeout(() => {
      if (timerGeneration !== this.responseTimerGeneration) {
        return;
      }
      this.responseTimer = null;
      void this.runSerialized(async () => {
        if (
          timerGeneration !== this.responseTimerGeneration ||
          !this.isActive(generation) ||
          this.state !== 'AWAITING_TARGET_TYPE_ACK'
        ) {
          return;
        }
        this.scanner.clear();
        if (this.options.targetType === 'RIFLE') {
          await this.beginRifleFallback(generation, 'TARGET_TYPE_ACK_TIMEOUT');
          return;
        }

        this.failInitialization(
          generation,
          'TARGET_TYPE_ACK_TIMEOUT',
          '[RedDot] Pistol target-type initialization failed; legacy polling is disabled',
        );
      }).catch((error: unknown) => {
        this.handleConnectionFailure(error, generation);
      });
    }, this.initializationTimeoutMs);
  }

  private startFallbackSettleTimer(generation: number, reason: string): void {
    this.clearResponseTimer();
    const timerGeneration = this.responseTimerGeneration;
    this.responseTimer = this.clock.setTimeout(() => {
      if (timerGeneration !== this.responseTimerGeneration) {
        return;
      }
      this.responseTimer = null;
      void this.runSerialized(async () => {
        if (
          timerGeneration !== this.responseTimerGeneration ||
          !this.isActive(generation) ||
          this.state !== 'FALLBACK_SETTLING'
        ) {
          return;
        }
        this.warn(
          'RIFLE_LEGACY_POLLING_FALLBACK',
          {
            reason,
            targetType: this.options.targetType,
            targetTypeByte: RED_DOT_RIFLE_TARGET_TYPE,
            initializationMode: 'LEGACY_RIFLE_FALLBACK',
            initializationTimeoutMs: this.initializationTimeoutMs,
            settleMs: this.fallbackSettleMs,
            pollIntervalMs: this.pollIntervalMs,
          },
          '[RedDot] Rifle target-type ACK was not confirmed; legacy ENQ polling fallback is active',
        );
        this.completeInitialization('LEGACY_RIFLE_FALLBACK', generation);
      }).catch((error: unknown) => {
        this.handleConnectionFailure(error, generation);
      });
    }, this.fallbackSettleMs);
  }

  private failInitialization(generation: number, reason: string, message: string): void {
    if (!this.isActive(generation)) {
      return;
    }

    const error = ErrorCatalog.createError('RED_DOT_INITIALIZATION_FAILED', {
      reason,
      targetType: this.options.targetType,
      timeoutMs: this.initializationTimeoutMs,
    });
    getLogger().error(message, 'usb', {
      code: 'RED_DOT_INITIALIZATION_FAILED',
      reason,
      targetType: this.options.targetType,
      timeoutMs: this.initializationTimeoutMs,
    });
    this.rejectReadiness(error);
  }

  private writeAndDrain(data: Buffer, command: string, generation: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isActive(generation)) {
        resolve();
        return;
      }

      try {
        this.port.write(Buffer.from(data), (writeError) => {
          if (!this.isActive(generation)) {
            resolve();
            return;
          }
          if (writeError) {
            reject(this.createWriteError(command, 'write', writeError));
            return;
          }

          try {
            this.port.drain((drainError) => {
              if (!this.isActive(generation)) {
                resolve();
                return;
              }
              if (drainError) {
                reject(this.createWriteError(command, 'drain', drainError));
                return;
              }
              resolve();
            });
          } catch (error) {
            reject(this.createWriteError(command, 'drain', error));
          }
        });
      } catch (error) {
        reject(this.createWriteError(command, 'write', error));
      }
    });
  }

  private createWriteError(command: string, stage: string, cause: unknown): Error {
    return ErrorCatalog.createError(
      'USB_WRITE_FAILED',
      {
        command,
        stage,
        reason: cause instanceof Error ? cause.message : String(cause),
      },
      cause instanceof Error ? cause : undefined,
    );
  }

  private handleConnectionFailure(error: unknown, generation: number): void {
    if (!this.isActive(generation)) {
      return;
    }

    const normalized = error instanceof Error ? error : new Error(String(error));
    if (this.readiness && !this.readiness.settled) {
      this.rejectReadiness(normalized);
      return;
    }

    this.stopInternal();
    try {
      this.options.onConnectionError?.(normalized);
    } catch {
      // A connection observer must not re-enter the protocol state machine.
    }
  }

  private warn(
    code: string,
    metadata: Record<string, unknown> = {},
    message = '[RedDot] Recoverable protocol warning',
  ): void {
    getLogger().warn(message, 'usb', { code, ...metadata });
    try {
      this.options.onWarning?.(code);
    } catch {
      // Diagnostic observers are non-critical.
    }
  }

  private resolveReadiness(): void {
    this.readiness?.resolve();
  }

  private rejectReadiness(error: Error): void {
    this.readiness?.reject(error);
  }

  private stopInternal(): void {
    this.generation += 1;
    this.running = false;
    this.clearPollTimer();
    this.clearResponseTimer();
    this.scanner.clear();
    this.initialized = false;
    this.initializationMode = null;
    this.invalidResponseCount = 0;
    this.port.removeListener('data', this.dataListener);
    this.state = 'STOPPED';
    this.operationQueue = Promise.resolve();
  }

  private isActive(generation: number): boolean {
    return this.running && generation === this.generation;
  }

  private clearPollTimer(): void {
    this.pollTimerGeneration += 1;
    if (this.pollTimer !== null) {
      this.clock.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private clearResponseTimer(): void {
    this.responseTimerGeneration += 1;
    if (this.responseTimer !== null) {
      this.clock.clearTimeout(this.responseTimer);
      this.responseTimer = null;
    }
  }
}
