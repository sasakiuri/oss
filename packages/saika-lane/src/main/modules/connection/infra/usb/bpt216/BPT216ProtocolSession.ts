// SPDX-License-Identifier: MIT

export interface BPT216SerialPort {
  on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  removeListener(event: 'data', listener: (chunk: Buffer) => void): unknown;
}

export interface BPT216ProtocolClock {
  now(): Date;
}

export interface BPT216ProtocolSessionOptions {
  readonly maxFrameBytes?: number;
  readonly clock?: BPT216ProtocolClock;
  readonly onFrame: (frame: Buffer, receivedAt: Date) => void;
  readonly onWarning?: (code: 'FRAME_TOO_LONG') => void;
  readonly onConnectionError?: (error: Error) => void;
}

const defaultClock: BPT216ProtocolClock = { now: () => new Date() };

/**
 * Delimits both BPT-216 ASCII streams and forwards shot frames only:
 * BP-217 I/F comma-separated terminal (`T`) frames and RS-232C fixed-width
 * pistol (`P`) frames. Ready (`R`), trajectory (`B`), status, and MT-201 lines
 * are ignored.
 */
export class BPT216ProtocolSession {
  private readonly maxFrameBytes: number;
  private readonly clock: BPT216ProtocolClock;
  private buffer = Buffer.alloc(0);
  private running = false;

  private readonly dataListener = (chunk: Buffer): void => {
    try {
      this.handleChunk(chunk);
    } catch (error) {
      this.options.onConnectionError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  constructor(
    private readonly port: BPT216SerialPort,
    private readonly options: BPT216ProtocolSessionOptions,
  ) {
    this.maxFrameBytes = options.maxFrameBytes ?? 4096;
    this.clock = options.clock ?? defaultClock;
  }

  start(): void {
    if (this.running) {
      this.stop();
    }
    this.buffer = Buffer.alloc(0);
    this.running = true;
    this.port.on('data', this.dataListener);
  }

  stop(): void {
    if (this.running) {
      this.port.removeListener('data', this.dataListener);
    }
    this.running = false;
    this.buffer = Buffer.alloc(0);
  }

  private handleChunk(chunk: Buffer): void {
    if (!this.running || chunk.length === 0) {
      return;
    }

    this.buffer = Buffer.concat([this.buffer, chunk]);
    let newlineIndex = this.buffer.indexOf(0x0a);
    while (newlineIndex >= 0) {
      const line = this.trimLine(this.buffer.subarray(0, newlineIndex));
      this.buffer = this.buffer.subarray(newlineIndex + 1);
      this.processLine(line);
      newlineIndex = this.buffer.indexOf(0x0a);
    }

    if (this.buffer.length > this.maxFrameBytes) {
      this.buffer = Buffer.alloc(0);
      this.options.onWarning?.('FRAME_TOO_LONG');
    }
  }

  private processLine(line: Buffer): void {
    if (line.length === 0 || line.length > this.maxFrameBytes) {
      if (line.length > this.maxFrameBytes) {
        this.options.onWarning?.('FRAME_TOO_LONG');
      }
      return;
    }

    const frame = line.toString('latin1');
    if (/^P(?: [0-9]\.[0-9]|10\.[0-9]) [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{2}$/i.test(frame)) {
      this.options.onFrame(Buffer.from(line), this.clock.now());
      return;
    }

    const fields = frame.split(',');
    if (fields.length >= 6 && fields[5]?.trim() === 'T') {
      this.options.onFrame(Buffer.from(line), this.clock.now());
    }
  }

  private trimLine(line: Buffer): Buffer {
    let start = 0;
    let end = line.length;
    while (start < end && this.isAsciiWhitespace(line[start]!)) start++;
    while (end > start && this.isAsciiWhitespace(line[end - 1]!)) end--;
    return line.subarray(start, end);
  }

  private isAsciiWhitespace(byte: number): boolean {
    return byte === 0x09 || byte === 0x0d || byte === 0x20;
  }
}
