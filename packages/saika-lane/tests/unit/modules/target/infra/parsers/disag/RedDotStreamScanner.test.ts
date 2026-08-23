// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { RedDotStreamScanner } from '@/main/modules/target/infra/parsers/disag/RedDotStreamScanner';

import { validRedDotFrame } from '../../../../../../helpers/redDotFixtures';

describe('RedDotStreamScanner', () => {
  it('returns exactly one frame for every possible two-part split', () => {
    const frame = validRedDotFrame();

    for (let split = 1; split < frame.length; split += 1) {
      const scanner = new RedDotStreamScanner();
      expect(scanner.push(frame.subarray(0, split)).filter((event) => event.type === 'frame')).toHaveLength(0);

      const events = scanner.push(frame.subarray(split));
      expect(events.filter((event) => event.type === 'frame')).toHaveLength(1);
      expect(scanner.getBufferedByteCount()).toBe(0);
    }
  });

  it('assembles a frame received one byte at a time', () => {
    const scanner = new RedDotStreamScanner();
    const frameEvents = [];
    for (const byte of validRedDotFrame()) {
      frameEvents.push(...scanner.push(Buffer.from([byte])));
    }

    expect(frameEvents.filter((event) => event.type === 'frame')).toHaveLength(1);
  });

  it('retains the receipt sequence of the first frame byte across chunks', () => {
    const scanner = new RedDotStreamScanner();
    const frame = validRedDotFrame();

    expect(scanner.push(frame.subarray(0, 20), 7)).toHaveLength(0);
    const event = scanner.push(frame.subarray(20), 8).find((candidate) => candidate.type === 'frame');

    expect(event).toMatchObject({ type: 'frame', startedAtReceiptSequence: 7 });
  });

  it('returns two combined frames in order', () => {
    const scanner = new RedDotStreamScanner();
    const first = validRedDotFrame();
    const second = Buffer.from(first);

    const events = scanner.push(Buffer.concat([first, second]));
    const frames = events.filter((event) => event.type === 'frame');

    expect(frames).toHaveLength(2);
    expect(frames[0]!.frame).toEqual(first);
    expect(frames[1]!.frame).toEqual(second);
  });

  it('handles ACK, NAK, noise, a partial frame, and the completed frame without losing sync', () => {
    const scanner = new RedDotStreamScanner();
    const frame = validRedDotFrame();

    const firstEvents = scanner.push(Buffer.concat([Buffer.from([0x06, 0x15, 0x41, 0x42]), frame.subarray(0, 20)]));
    const secondEvents = scanner.push(frame.subarray(20));

    expect(firstEvents.map((event) => event.type)).toEqual(['ack', 'idle', 'noise']);
    expect(secondEvents.filter((event) => event.type === 'frame')).toHaveLength(1);
  });

  it('resynchronizes to an ACK marker after leading noise', () => {
    const scanner = new RedDotStreamScanner();

    const events = scanner.push(Buffer.from([0x41, 0x42, 0x06]), 42);

    expect(events.map((event) => event.type)).toEqual(['noise', 'ack']);
    expect(events[1]).toMatchObject({ type: 'ack', receivedAtReceiptSequence: 42 });
  });

  it('discards a structurally invalid candidate and finds the next frame', () => {
    const scanner = new RedDotStreamScanner();
    const malformed = validRedDotFrame();
    malformed[9] = 0x0a;
    const valid = validRedDotFrame();

    const events = scanner.push(Buffer.concat([malformed, valid]));

    expect(events.filter((event) => event.type === 'invalid-structure')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'frame')).toHaveLength(1);
  });

  it('does not reinterpret control bytes inside a structurally invalid frame', () => {
    const scanner = new RedDotStreamScanner();
    const malformed = validRedDotFrame();
    malformed[56] = 0x06;

    const events = scanner.push(malformed, 42);

    expect(events.map((event) => event.type)).toEqual(['invalid-structure']);
    expect(scanner.getBufferedByteCount()).toBe(0);
  });

  it('consumes a complete bad-BCC candidate before accepting the next frame', () => {
    const scanner = new RedDotStreamScanner();
    const malformed = validRedDotFrame();
    malformed[57] = malformed[57]! ^ 0x01;
    const valid = validRedDotFrame();

    const events = scanner.push(Buffer.concat([malformed, valid]));

    expect(events.map((event) => event.type)).toEqual(['invalid-frame', 'frame']);
  });

  it('bounds its buffer and retains a trailing incomplete STX candidate', () => {
    const scanner = new RedDotStreamScanner({ maxBufferBytes: 32 });
    const trailingCandidate = validRedDotFrame().subarray(0, 10);
    const events = scanner.push(Buffer.concat([Buffer.alloc(40, 0x41), trailingCandidate]));

    expect(events.filter((event) => event.type === 'overflow')).toHaveLength(1);
    expect(scanner.getBufferedByteCount()).toBe(10);
  });

  it('retains and decodes a trailing complete frame after buffer overflow', () => {
    const scanner = new RedDotStreamScanner({ maxBufferBytes: 64 });
    const frame = validRedDotFrame();

    const events = scanner.push(Buffer.concat([Buffer.alloc(10, 0x41), frame]), 9);

    expect(events.map((event) => event.type)).toEqual(['overflow', 'frame']);
    expect(events[0]).toEqual({ type: 'overflow', droppedByteCount: 10 });
    expect(events[1]).toMatchObject({ type: 'frame', frame, startedAtReceiptSequence: 9 });
    expect(scanner.getBufferedByteCount()).toBe(0);
  });
});
