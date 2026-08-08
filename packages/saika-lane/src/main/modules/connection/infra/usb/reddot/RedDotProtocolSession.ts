// SPDX-License-Identifier: MIT
import {
  type RedDotStreamEvent,
  RedDotStreamScanner,
} from '@/main/modules/target/infra/parsers/disag/RedDotStreamScanner';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

export const RED_DOT_ENQ = 0x05;
export const RED_DOT_ACK = 0x06;
export const RED_DOT_NAK = 0x15;

export type RedDotProtocolState = 'STOPPED' | 'POLL_SCHEDULED' | 'AWAITING_RESPONSE' | 'WRITING_REPLY';

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
  readonly pollIntervalMs?: number;
  readonly responseTimeoutMs?: number;
  readonly maxBufferBytes?: number;
  readonly maxInvalidResponsesPerPoll?: number;
  readonly clock?: RedDotProtocolClock;
  readonly onFrame: (frame: Buffer, receivedAt: Date) => void;
  readonly onConnectionError?: (error: Error) => void;
  readonly onWarning?: (code: string) => void;
}

const defaultClock: RedDotProtocolClock = {
  now: () => new Date(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Owns the RedDot ENQ polling and ACK/NAK reply state machine for one open port.
 */
export class RedDotProtocolSession {
  private readonly pollIntervalMs: number;
  private readonly responseTimeoutMs: number;
  private readonly maxInvalidResponsesPerPoll: number;
  private readonly clock: RedDotProtocolClock;
  private readonly scanner: RedDotStreamScanner;
  private state: RedDotProtocolState = 'STOPPED';
  private running = false;
  private generation = 0;
  private invalidResponseCount = 0;
  private pollTimer: unknown = null;
  private responseTimer: unknown = null;
  private operationQueue: Promise<void> = Promise.resolve();

  private readonly dataListener = (chunk: Buffer): void => {
    const generation = this.generation;
    void this.runSerialized(() => this.handleChunk(chunk, generation)).catch((error: unknown) => {
      this.handleConnectionFailure(error, generation);
    });
  };

  constructor(
    private readonly port: RedDotSerialPort,
    private readonly options: RedDotProtocolSessionOptions,
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 300;
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
    this.invalidResponseCount = 0;
    this.scanner.clear();
    this.operationQueue = Promise.resolve();
    this.port.on('data', this.dataListener);

    try {
      await this.runSerialized(() => this.beginPoll(generation));
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop(): void {
    this.generation += 1;
    this.running = false;
    this.clearPollTimer();
    this.clearResponseTimer();
    this.scanner.clear();
    this.invalidResponseCount = 0;
    this.port.removeListener('data', this.dataListener);
    this.state = 'STOPPED';
    this.operationQueue = Promise.resolve();
  }

  getState(): RedDotProtocolState {
    return this.state;
  }

  private runSerialized(operation: () => Promise<void>): Promise<void> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.catch(() => undefined);
    return result;
  }

  private async beginPoll(generation: number): Promise<void> {
    if (!this.isActive(generation)) {
      return;
    }

    this.clearPollTimer();
    this.clearResponseTimer();
    await this.writeAndDrain(RED_DOT_ENQ, 'ENQ', generation);

    if (!this.isActive(generation)) {
      return;
    }

    this.state = 'AWAITING_RESPONSE';
    this.startResponseTimer(generation);
  }

  private async handleChunk(chunk: Buffer, generation: number): Promise<void> {
    if (!this.isActive(generation)) {
      return;
    }

    const events = this.scanner.push(chunk);
    for (const event of events) {
      if (!this.isActive(generation)) {
        return;
      }
      await this.handleStreamEvent(event, generation);
    }
  }

  private async handleStreamEvent(event: RedDotStreamEvent, generation: number): Promise<void> {
    switch (event.type) {
      case 'idle':
        this.schedulePoll(generation);
        return;
      case 'noise':
        this.warn('STREAM_NOISE', { byteCount: event.byteCount });
        return;
      case 'overflow':
        this.warn('BUFFER_OVERFLOW', { byteCount: event.droppedByteCount });
        return;
      case 'invalid-structure':
      case 'invalid-frame':
        await this.rejectFrame(event, generation);
        return;
      case 'frame':
        await this.acceptFrame(event, generation);
        return;
    }
  }

  private async rejectFrame(
    event: Extract<RedDotStreamEvent, { type: 'invalid-structure' | 'invalid-frame' }>,
    generation: number,
  ): Promise<void> {
    this.clearPollTimer();
    this.clearResponseTimer();
    this.invalidResponseCount += 1;
    this.warn(event.error.code, event.error.offset === undefined ? {} : { offset: event.error.offset });
    this.state = 'WRITING_REPLY';
    await this.writeAndDrain(RED_DOT_NAK, 'NAK', generation);

    if (!this.isActive(generation)) {
      return;
    }

    if (this.invalidResponseCount >= this.maxInvalidResponsesPerPoll) {
      this.scanner.clear();
      this.schedulePoll(generation);
      return;
    }

    this.state = 'AWAITING_RESPONSE';
    this.startResponseTimer(generation);
  }

  private async acceptFrame(event: Extract<RedDotStreamEvent, { type: 'frame' }>, generation: number): Promise<void> {
    this.clearPollTimer();
    this.clearResponseTimer();
    this.state = 'WRITING_REPLY';
    await this.writeAndDrain(RED_DOT_ACK, 'ACK', generation);

    if (!this.isActive(generation)) {
      return;
    }

    try {
      this.options.onFrame(Buffer.from(event.frame), new Date(event.receivedAt.getTime()));
    } catch {
      this.warn('FRAME_CALLBACK_FAILED');
    }
    this.schedulePoll(generation);
  }

  private schedulePoll(generation: number): void {
    if (!this.isActive(generation)) {
      return;
    }

    this.clearPollTimer();
    this.clearResponseTimer();
    this.invalidResponseCount = 0;
    this.state = 'POLL_SCHEDULED';
    this.pollTimer = this.clock.setTimeout(() => {
      this.pollTimer = null;
      void this.runSerialized(() => this.beginPoll(generation)).catch((error: unknown) => {
        this.handleConnectionFailure(error, generation);
      });
    }, this.pollIntervalMs);
  }

  private startResponseTimer(generation: number): void {
    this.clearResponseTimer();
    this.responseTimer = this.clock.setTimeout(() => {
      this.responseTimer = null;
      void this.runSerialized(async () => {
        if (!this.isActive(generation)) {
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

  private writeAndDrain(byte: number, command: 'ENQ' | 'ACK' | 'NAK', generation: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isActive(generation)) {
        resolve();
        return;
      }

      try {
        this.port.write(Buffer.from([byte]), (writeError) => {
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
    this.stop();
    try {
      this.options.onConnectionError?.(normalized);
    } catch {
      // A connection observer must not re-enter the protocol state machine.
    }
  }

  private warn(code: string, metadata: Record<string, unknown> = {}): void {
    getLogger().warn('[RedDot] Recoverable protocol warning', 'usb', { code, ...metadata });
    try {
      this.options.onWarning?.(code);
    } catch {
      // Diagnostic observers are non-critical.
    }
  }

  private isActive(generation: number): boolean {
    return this.running && generation === this.generation;
  }

  private clearPollTimer(): void {
    if (this.pollTimer !== null) {
      this.clock.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private clearResponseTimer(): void {
    if (this.responseTimer !== null) {
      this.clock.clearTimeout(this.responseTimer);
      this.responseTimer = null;
    }
  }
}
