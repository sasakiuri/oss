// SPDX-License-Identifier: MIT
import {
  getRedDotFixedStructureError,
  RedDotFrameDecodeError,
  RedDotFrameDecoder,
  type RedDotParsedFrame,
} from '@/main/modules/target/adapters/disag/RedDotFrameDecoder';

import { RED_DOT_FRAME_LENGTH } from './RedDotChecksum';

const STX = 0x02;
const ACK = 0x06;
const NAK = 0x15;

export type RedDotStreamEvent =
  | { readonly type: 'ack' }
  | { readonly type: 'idle' }
  | {
      readonly type: 'frame';
      readonly frame: Buffer;
      readonly parsed: RedDotParsedFrame;
      readonly receivedAt: Date;
    }
  | { readonly type: 'invalid-structure'; readonly error: RedDotFrameDecodeError }
  | { readonly type: 'invalid-frame'; readonly error: RedDotFrameDecodeError }
  | { readonly type: 'noise'; readonly byteCount: number }
  | { readonly type: 'overflow'; readonly droppedByteCount: number };

export interface RedDotStreamScannerOptions {
  readonly maxBufferBytes?: number;
  readonly now?: () => Date;
}

/**
 * Binary stream scanner for RedDot ACK/NAK responses and fixed-size shot frames.
 */
export class RedDotStreamScanner {
  private buffer = Buffer.alloc(0);
  private readonly decoder: RedDotFrameDecoder;
  private readonly maxBufferBytes: number;
  private readonly now: () => Date;

  constructor(options: RedDotStreamScannerOptions = {}, decoder = new RedDotFrameDecoder()) {
    this.decoder = decoder;
    this.maxBufferBytes = options.maxBufferBytes ?? 4096;
    this.now = options.now ?? (() => new Date());
  }

  push(chunk: Buffer): RedDotStreamEvent[] {
    const events: RedDotStreamEvent[] = [];
    this.buffer = Buffer.concat([this.buffer, chunk]);

    if (this.buffer.length > this.maxBufferBytes) {
      const originalLength = this.buffer.length;
      const lastStx = this.buffer.lastIndexOf(STX);
      const suffix = lastStx >= 0 ? this.buffer.subarray(lastStx) : Buffer.alloc(0);
      this.buffer =
        lastStx >= 0 && suffix.length < RED_DOT_FRAME_LENGTH && suffix.length <= this.maxBufferBytes
          ? Buffer.from(suffix)
          : Buffer.alloc(0);
      events.push(
        Object.freeze({
          type: 'overflow',
          droppedByteCount: originalLength - this.buffer.length,
        }),
      );
    }

    while (this.buffer.length > 0) {
      const firstByte = this.buffer[0];

      if (firstByte === ACK) {
        this.consume(1);
        events.push(Object.freeze({ type: 'ack' }));
        continue;
      }

      if (firstByte === NAK) {
        this.consume(1);
        events.push(Object.freeze({ type: 'idle' }));
        continue;
      }

      if (firstByte !== STX) {
        const markerOffset = this.findNextMarkerOffset();
        const byteCount = markerOffset === -1 ? this.buffer.length : markerOffset;
        this.consume(byteCount);
        events.push(Object.freeze({ type: 'noise', byteCount }));
        continue;
      }

      if (this.buffer.length < RED_DOT_FRAME_LENGTH) {
        break;
      }

      const candidate = Buffer.from(this.buffer.subarray(0, RED_DOT_FRAME_LENGTH));
      const receivedAt = this.now();
      const structureError = getRedDotFixedStructureError(candidate);
      if (structureError) {
        this.consume(1);
        events.push(Object.freeze({ type: 'invalid-structure', error: structureError }));
        continue;
      }

      try {
        const parsed = this.decoder.decode(candidate);
        this.consume(RED_DOT_FRAME_LENGTH);
        events.push(Object.freeze({ type: 'frame', frame: candidate, parsed, receivedAt }));
      } catch (error) {
        if (!(error instanceof RedDotFrameDecodeError)) {
          throw error;
        }
        this.consume(RED_DOT_FRAME_LENGTH);
        events.push(Object.freeze({ type: 'invalid-frame', error }));
      }
    }

    return events;
  }

  clear(): void {
    this.buffer = Buffer.alloc(0);
  }

  getBufferedByteCount(): number {
    return this.buffer.length;
  }

  getRemainingBuffer(): Buffer {
    return Buffer.from(this.buffer);
  }

  private consume(byteCount: number): void {
    this.buffer = Buffer.from(this.buffer.subarray(byteCount));
  }

  private findNextMarkerOffset(): number {
    for (let offset = 1; offset < this.buffer.length; offset += 1) {
      const byte = this.buffer[offset];
      if (byte === ACK || byte === NAK || byte === STX) {
        return offset;
      }
    }
    return -1;
  }
}
