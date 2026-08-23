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
  | { readonly type: 'ack'; readonly receivedAtReceiptSequence: number }
  | { readonly type: 'idle' }
  | {
      readonly type: 'frame';
      readonly frame: Buffer;
      readonly parsed: RedDotParsedFrame;
      readonly receivedAt: Date;
      readonly startedAtReceiptSequence: number;
    }
  | {
      readonly type: 'invalid-structure';
      readonly error: RedDotFrameDecodeError;
      readonly startedAtReceiptSequence: number;
    }
  | {
      readonly type: 'invalid-frame';
      readonly error: RedDotFrameDecodeError;
      readonly startedAtReceiptSequence: number;
    }
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
  private bufferReceiptSequences: number[] = [];
  private readonly decoder: RedDotFrameDecoder;
  private readonly maxBufferBytes: number;
  private readonly now: () => Date;

  constructor(options: RedDotStreamScannerOptions = {}, decoder = new RedDotFrameDecoder()) {
    this.decoder = decoder;
    this.maxBufferBytes = options.maxBufferBytes ?? 4096;
    this.now = options.now ?? (() => new Date());
  }

  push(chunk: Buffer, receiptSequence = 0): RedDotStreamEvent[] {
    const events: RedDotStreamEvent[] = [];
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.bufferReceiptSequences.push(...Array.from({ length: chunk.length }, () => receiptSequence));

    if (this.buffer.length > this.maxBufferBytes) {
      const originalLength = this.buffer.length;
      const lastStx = this.buffer.lastIndexOf(STX);
      const suffix = lastStx >= 0 ? this.buffer.subarray(lastStx) : Buffer.alloc(0);
      const retainSuffix = lastStx >= 0 && suffix.length < RED_DOT_FRAME_LENGTH && suffix.length <= this.maxBufferBytes;
      this.buffer = retainSuffix ? Buffer.from(suffix) : Buffer.alloc(0);
      this.bufferReceiptSequences = retainSuffix ? this.bufferReceiptSequences.slice(lastStx) : [];
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
        const receivedAtReceiptSequence = this.bufferReceiptSequences[0] ?? receiptSequence;
        this.consume(1);
        events.push(Object.freeze({ type: 'ack', receivedAtReceiptSequence }));
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
      const startedAtReceiptSequence = this.bufferReceiptSequences[0] ?? receiptSequence;
      const receivedAt = this.now();
      const structureError = getRedDotFixedStructureError(candidate);
      if (structureError) {
        this.consume(1);
        events.push(Object.freeze({ type: 'invalid-structure', error: structureError, startedAtReceiptSequence }));
        continue;
      }

      try {
        const parsed = this.decoder.decode(candidate);
        this.consume(RED_DOT_FRAME_LENGTH);
        events.push(Object.freeze({ type: 'frame', frame: candidate, parsed, receivedAt, startedAtReceiptSequence }));
      } catch (error) {
        if (!(error instanceof RedDotFrameDecodeError)) {
          throw error;
        }
        this.consume(RED_DOT_FRAME_LENGTH);
        events.push(Object.freeze({ type: 'invalid-frame', error, startedAtReceiptSequence }));
      }
    }

    return events;
  }

  clear(): void {
    this.buffer = Buffer.alloc(0);
    this.bufferReceiptSequences = [];
  }

  getBufferedByteCount(): number {
    return this.buffer.length;
  }

  getRemainingBuffer(): Buffer {
    return Buffer.from(this.buffer);
  }

  private consume(byteCount: number): void {
    this.buffer = Buffer.from(this.buffer.subarray(byteCount));
    this.bufferReceiptSequences = this.bufferReceiptSequences.slice(byteCount);
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
