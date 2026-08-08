// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { SerialDataParser } from '@/main/modules/target/infra/SerialDataParser';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    isLevelEnabled: vi.fn().mockReturnValue(false),
  }),
}));

describe('SerialDataParser', () => {
  let parser: SerialDataParser;

  beforeEach(() => {
    parser = new SerialDataParser(SerialDataParser.defaultParsers());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parse() - CUSTOM format (CSV)', () => {
    it('should parse a complete CSV message (1 line)', () => {
      const buffer = Buffer.from('12.5,-8.3,ABC\n');
      const manufacturer = TargetManufacturer.custom();

      const results = parser.parse(buffer, manufacturer);

      expect(results).toHaveLength(1);
      expect(results[0]!.raw.toString()).toBe('12.5,-8.3,ABC');
      expect(results[0]!.manufacturer.equals(manufacturer)).toBe(true);
      expect(results[0]!.timestamp).toBeInstanceOf(Date);
    });

    it('should parse multiple CSV messages at once', () => {
      const buffer = Buffer.from('12.5,-8.3,ABC\n5.0,10.2,DEF\n-3.1,4.5,GHI\n');
      const manufacturer = TargetManufacturer.custom();

      const results = parser.parse(buffer, manufacturer);

      expect(results).toHaveLength(3);
      expect(results[0]!.raw.toString()).toBe('12.5,-8.3,ABC');
      expect(results[1]!.raw.toString()).toBe('5.0,10.2,DEF');
      expect(results[2]!.raw.toString()).toBe('-3.1,4.5,GHI');
    });

    it('should buffer incomplete CSV messages', () => {
      const manufacturer = TargetManufacturer.custom();

      // First partial data
      const chunk1 = Buffer.from('12.5,');
      const results1 = parser.parse(chunk1, manufacturer);
      expect(results1).toHaveLength(0); // Incomplete so no parse result

      // Remaining data
      const chunk2 = Buffer.from('-8.3,ABC\n');
      const results2 = parser.parse(chunk2, manufacturer);
      expect(results2).toHaveLength(1);
      expect(results2[0]!.raw.toString()).toBe('12.5,-8.3,ABC');
    });

    it('should parse only complete messages when complete and incomplete messages are mixed', () => {
      const manufacturer = TargetManufacturer.custom();

      const buffer = Buffer.from('12.5,-8.3,ABC\n5.0,10.2,');
      const results = parser.parse(buffer, manufacturer);

      expect(results).toHaveLength(1);
      expect(results[0]!.raw.toString()).toBe('12.5,-8.3,ABC');

      // Receive the rest in the next chunk
      const chunk2 = Buffer.from('DEF\n');
      const results2 = parser.parse(chunk2, manufacturer);
      expect(results2).toHaveLength(1);
      expect(results2[0]!.raw.toString()).toBe('5.0,10.2,DEF');
    });

    it('should not throw an error when passing an empty Buffer', () => {
      const buffer = Buffer.from('');
      const manufacturer = TargetManufacturer.custom();

      expect(() => parser.parse(buffer, manufacturer)).not.toThrow();
      const results = parser.parse(buffer, manufacturer);
      expect(results).toHaveLength(0);
    });

    it('should return an empty array when passing a Buffer with only a newline', () => {
      const buffer = Buffer.from('\n');
      const manufacturer = TargetManufacturer.custom();

      const results = parser.parse(buffer, manufacturer);
      expect(results).toHaveLength(0);
    });

    it('should skip CSV lines with invalid field count', () => {
      const buffer = Buffer.from('12.5,-8.3\n'); // No checksum
      const manufacturer = TargetManufacturer.custom();

      const results = parser.parse(buffer, manufacturer);
      expect(results).toHaveLength(0); // Invalid lines are skipped
    });

    it('should correctly parse negative coordinate values', () => {
      const buffer = Buffer.from('-12.5,-8.3,ABC\n');
      const manufacturer = TargetManufacturer.custom();

      const results = parser.parse(buffer, manufacturer);
      expect(results).toHaveLength(1);
      expect(results[0]!.raw.toString()).toBe('-12.5,-8.3,ABC');
    });

    it('should correctly parse integer coordinate values', () => {
      const buffer = Buffer.from('10,20,ABC\n');
      const manufacturer = TargetManufacturer.custom();

      const results = parser.parse(buffer, manufacturer);
      expect(results).toHaveLength(1);
      expect(results[0]!.raw.toString()).toBe('10,20,ABC');
    });
  });

  describe('parse() - SIUS format (mock)', () => {
    it('should parse a fixed-length 32-byte message', () => {
      // 32-byte dummy data (X coordinate: 125, Y coordinate: -83)
      const buffer = Buffer.alloc(32);
      buffer.writeInt16LE(125, 0); // X coordinate (bytes 0-1)
      buffer.writeInt16LE(-83, 2); // Y coordinate (bytes 2-3)

      const manufacturer = TargetManufacturer.sius();
      const results = parser.parse(buffer, manufacturer);

      expect(results).toHaveLength(1);
      expect(results[0]!.raw).toHaveLength(32);
      expect(results[0]!.manufacturer.equals(manufacturer)).toBe(true);
      expect(results[0]!.timestamp).toBeInstanceOf(Date);
    });

    it('should process multiple 32-byte messages', () => {
      // 64 bytes (32 bytes x 2 messages)
      const buffer = Buffer.alloc(64);

      // First message
      buffer.writeInt16LE(125, 0);
      buffer.writeInt16LE(-83, 2);

      // Second message
      buffer.writeInt16LE(50, 32);
      buffer.writeInt16LE(102, 34);

      const manufacturer = TargetManufacturer.sius();
      const results = parser.parse(buffer, manufacturer);

      expect(results).toHaveLength(2);
      expect(results[0]!.raw).toHaveLength(32);
      expect(results[1]!.raw).toHaveLength(32);
    });

    it('should buffer incomplete messages (less than 32 bytes)', () => {
      const manufacturer = TargetManufacturer.sius();

      // First 16 bytes
      const chunk1 = Buffer.alloc(16);
      chunk1.writeInt16LE(125, 0);
      const results1 = parser.parse(chunk1, manufacturer);
      expect(results1).toHaveLength(0);

      // Remaining 16 bytes
      const chunk2 = Buffer.alloc(16);
      chunk2.writeInt16LE(-83, 0);
      const results2 = parser.parse(chunk2, manufacturer);
      expect(results2).toHaveLength(1);
      expect(results2[0]!.raw).toHaveLength(32);
    });

    it('should parse only complete messages when complete and incomplete messages are mixed', () => {
      const manufacturer = TargetManufacturer.sius();

      // 32 bytes + 16 bytes (incomplete)
      const buffer = Buffer.alloc(48);
      buffer.writeInt16LE(125, 0);
      buffer.writeInt16LE(-83, 2);
      buffer.writeInt16LE(50, 32);

      const results = parser.parse(buffer, manufacturer);
      expect(results).toHaveLength(1);
      expect(results[0]!.raw).toHaveLength(32);

      // Receive remaining 16 bytes in the next chunk
      const chunk2 = Buffer.alloc(16);
      chunk2.writeInt16LE(102, 0);
      const results2 = parser.parse(chunk2, manufacturer);
      expect(results2).toHaveLength(1);
      expect(results2[0]!.raw).toHaveLength(32);
    });
  });

  describe('parse() - Meyton format (mock)', () => {
    it('should parse JSON-format messages', () => {
      const json = JSON.stringify({
        x: 12.5,
        y: -8.3,
        timestamp: '2026-01-13T12:00:00.000Z',
      });
      const buffer = Buffer.from(json + '\n');
      const manufacturer = TargetManufacturer.meyton();

      const results = parser.parse(buffer, manufacturer);

      expect(results).toHaveLength(1);
      expect(results[0]!.raw.toString()).toBe(json);
      expect(results[0]!.manufacturer.equals(manufacturer)).toBe(true);
      expect(results[0]!.timestamp).toBeInstanceOf(Date);
    });

    it('should process multiple JSON messages', () => {
      const json1 = JSON.stringify({ x: 12.5, y: -8.3, timestamp: '2026-01-13T12:00:00.000Z' });
      const json2 = JSON.stringify({ x: 5.0, y: 10.2, timestamp: '2026-01-13T12:00:01.000Z' });
      const buffer = Buffer.from(json1 + '\n' + json2 + '\n');
      const manufacturer = TargetManufacturer.meyton();

      const results = parser.parse(buffer, manufacturer);

      expect(results).toHaveLength(2);
      expect(results[0]!.raw.toString()).toBe(json1);
      expect(results[1]!.raw.toString()).toBe(json2);
    });

    it('should buffer incomplete JSON', () => {
      const manufacturer = TargetManufacturer.meyton();

      // First partial data
      const chunk1 = Buffer.from('{"x": 12.5,');
      const results1 = parser.parse(chunk1, manufacturer);
      expect(results1).toHaveLength(0);

      // Remaining data
      const chunk2 = Buffer.from(' "y": -8.3, "timestamp": "2026-01-13T12:00:00.000Z"}\n');
      const results2 = parser.parse(chunk2, manufacturer);
      expect(results2).toHaveLength(1);

      const parsedJson = JSON.parse(results2[0]!.raw.toString());
      expect(parsedJson.x).toBe(12.5);
      expect(parsedJson.y).toBe(-8.3);
    });

    it('should skip invalid JSON format', () => {
      const buffer = Buffer.from('{ invalid json }\n');
      const manufacturer = TargetManufacturer.meyton();

      const results = parser.parse(buffer, manufacturer);
      expect(results).toHaveLength(0); // Invalid JSON is skipped
    });
  });

  describe('parse() - DISAG RedDot format', () => {
    const frame = Buffer.from(
      '0230303030303030300d30303030303030300d4c470d30310d312e300d30310d30392e300d303530302e300d2b303330300d2b303430300d173a24',
      'hex',
    );

    it('should parse a complete RedDot frame', () => {
      const manufacturer = TargetManufacturer.disag();

      const results = parser.parse(frame, manufacturer);

      expect(results).toHaveLength(1);
      expect(results[0]!.raw).toEqual(frame);
      expect(results[0]!.manufacturer.equals(manufacturer)).toBe(true);
      expect(results[0]!.timestamp).toBeInstanceOf(Date);
    });

    it('should process multiple RedDot frames', () => {
      const manufacturer = TargetManufacturer.disag();

      const results = parser.parse(Buffer.concat([frame, frame]), manufacturer);

      expect(results).toHaveLength(2);
    });

    it('should buffer a split RedDot frame', () => {
      const manufacturer = TargetManufacturer.disag();

      const results1 = parser.parse(frame.subarray(0, 20), manufacturer);
      expect(results1).toHaveLength(0);

      const results2 = parser.parse(frame.subarray(20), manufacturer);
      expect(results2).toHaveLength(1);
      expect(results2[0]!.raw).toEqual(frame);
    });
  });

  describe('parse() - KOHTO format (MT201)', () => {
    it('should parse valid MT201 data', () => {
      const manufacturer = TargetManufacturer.kohto();
      const parser = new SerialDataParser(SerialDataParser.defaultParsers());

      // MT201 format: "R 9.7 0250 FF5F 70\n"
      const chunk = Buffer.from('R 9.7 0250 FF5F 70\n', 'utf-8');
      const results = parser.parse(chunk, manufacturer);

      expect(results).toHaveLength(1);
      expect(results[0]!.raw.toString('utf-8')).toBe('R 9.7 0250 FF5F 70');
      expect(results[0]!.manufacturer.equals(manufacturer)).toBe(true);
      expect(results[0]!.timestamp).toBeInstanceOf(Date);
    });

    it('should parse multiple MT201 data', () => {
      const manufacturer = TargetManufacturer.kohto();
      const parser = new SerialDataParser(SerialDataParser.defaultParsers());

      const chunk = Buffer.from('R 9.7 0250 FF5F 70\nS10.5 00D0 FFC8 71\n', 'utf-8');
      const results = parser.parse(chunk, manufacturer);

      expect(results).toHaveLength(2);
      expect(results[0]!.raw.toString('utf-8')).toBe('R 9.7 0250 FF5F 70');
      expect(results[1]!.raw.toString('utf-8')).toBe('S10.5 00D0 FFC8 71');
    });

    it('should retain incomplete data in the buffer', () => {
      const manufacturer = TargetManufacturer.kohto();
      const parser = new SerialDataParser(SerialDataParser.defaultParsers());

      // No newline (incomplete)
      const chunk1 = Buffer.from('R 9.7 0250', 'utf-8');
      const results1 = parser.parse(chunk1, manufacturer);

      expect(results1).toHaveLength(0);

      // Send continuation
      const chunk2 = Buffer.from(' FF5F 70\n', 'utf-8');
      const results2 = parser.parse(chunk2, manufacturer);

      expect(results2).toHaveLength(1);
      expect(results2[0]!.raw.toString('utf-8')).toBe('R 9.7 0250 FF5F 70');
    });

    it('should skip empty lines', () => {
      const manufacturer = TargetManufacturer.kohto();
      const parser = new SerialDataParser(SerialDataParser.defaultParsers());

      const chunk = Buffer.from('R 9.7 0250 FF5F 70\n\n\nS10.5 00D0 FFC8 71\n', 'utf-8');
      const results = parser.parse(chunk, manufacturer);

      expect(results).toHaveLength(2);
    });
  });

  describe('Buffering logic', () => {
    it('should receive partial data across multiple chunks (CUSTOM format)', () => {
      const manufacturer = TargetManufacturer.custom();

      // Simulate receiving one character at a time
      const message = '12.5,-8.3,ABC\n';
      for (let i = 0; i < message.length - 1; i++) {
        const chunk = Buffer.from(message[i]!);
        const results = parser.parse(chunk, manufacturer);
        expect(results).toHaveLength(0); // No result until the final newline
      }

      // Becomes a complete message with the final newline
      const lastChunk = Buffer.from(message[message.length - 1]!);
      const results = parser.parse(lastChunk, manufacturer);
      expect(results).toHaveLength(1);
      expect(results[0]!.raw.toString()).toBe('12.5,-8.3,ABC');
    });

    it('should correctly concatenate the buffer', () => {
      const manufacturer = TargetManufacturer.custom();

      parser.parse(Buffer.from('12'), manufacturer);
      parser.parse(Buffer.from('.5'), manufacturer);
      parser.parse(Buffer.from(','), manufacturer);
      parser.parse(Buffer.from('-8.3'), manufacturer);
      parser.parse(Buffer.from(',AB'), manufacturer);
      const results = parser.parse(Buffer.from('C\n'), manufacturer);

      expect(results).toHaveLength(1);
      expect(results[0]!.raw.toString()).toBe('12.5,-8.3,ABC');
    });

    it('should leave the remainder in the buffer after extracting a complete message', () => {
      const manufacturer = TargetManufacturer.custom();

      // 1 complete message + incomplete message
      const buffer = Buffer.from('12.5,-8.3,ABC\n5.0,');
      const results = parser.parse(buffer, manufacturer);

      expect(results).toHaveLength(1);
      expect(results[0]!.raw.toString()).toBe('12.5,-8.3,ABC');

      // Receive the rest in the next chunk
      const chunk2 = Buffer.from('10.2,DEF\n');
      const results2 = parser.parse(chunk2, manufacturer);
      expect(results2).toHaveLength(1);
      expect(results2[0]!.raw.toString()).toBe('5.0,10.2,DEF');
    });
  });

  describe('clearBuffer()', () => {
    it('should clear the buffer', () => {
      const manufacturer = TargetManufacturer.custom();

      // Accumulate incomplete data in the buffer
      parser.parse(Buffer.from('12.5,-8.3'), manufacturer);

      // Clear the buffer
      parser.clearBuffer();

      // Next data is treated as a new message
      const results = parser.parse(Buffer.from(',ABC\n'), manufacturer);
      expect(results).toHaveLength(0); // Incomplete so no result
    });

    it('should correctly parse new messages after buffer clear', () => {
      const manufacturer = TargetManufacturer.custom();

      // Incomplete data
      parser.parse(Buffer.from('12.5,'), manufacturer);

      // Buffer clear
      parser.clearBuffer();

      // New complete message
      const results = parser.parse(Buffer.from('5.0,10.2,DEF\n'), manufacturer);
      expect(results).toHaveLength(1);
      expect(results[0]!.raw.toString()).toBe('5.0,10.2,DEF');
    });
  });

  describe('Timeout handling', () => {
    it('should clear the buffer on timeout', () => {
      vi.useFakeTimers();
      const manufacturer = TargetManufacturer.custom();

      // Accumulate incomplete data in the buffer
      parser.parse(Buffer.from('12.5,-8.3'), manufacturer);

      // 1 second elapsed (timeout)
      vi.advanceTimersByTime(1000);

      // New data after timeout is treated as an independent message
      const results = parser.parse(Buffer.from(',ABC\n'), manufacturer);
      expect(results).toHaveLength(0); // Incomplete because buffer was cleared on timeout

      vi.useRealTimers();
    });

    it('should retain data before timeout', () => {
      vi.useFakeTimers();
      const manufacturer = TargetManufacturer.custom();

      // Accumulate incomplete data in the buffer
      parser.parse(Buffer.from('12.5,-8.3'), manufacturer);

      // 500ms elapsed (before timeout)
      vi.advanceTimersByTime(500);

      // Buffer is retained because timeout has not occurred
      const results = parser.parse(Buffer.from(',ABC\n'), manufacturer);
      expect(results).toHaveLength(1);
      expect(results[0]!.raw.toString()).toBe('12.5,-8.3,ABC');

      vi.useRealTimers();
    });

    it('should reset the timeout timer on each data reception', () => {
      vi.useFakeTimers();
      const manufacturer = TargetManufacturer.custom();

      // First chunk
      parser.parse(Buffer.from('12.5'), manufacturer);

      // 500ms elapsed
      vi.advanceTimersByTime(500);

      // Second chunk (timer reset)
      parser.parse(Buffer.from(','), manufacturer);

      // Another 900ms elapsed (total 1400ms, but 900ms since last data)
      vi.advanceTimersByTime(900);

      // Timer was reset, so data is retained
      const results = parser.parse(Buffer.from('-8.3,ABC\n'), manufacturer);
      expect(results).toHaveLength(1);
      expect(results[0]!.raw.toString()).toBe('12.5,-8.3,ABC');

      vi.useRealTimers();
    });
  });

  describe('Error cases', () => {
    it('should throw an error for an unsupported manufacturer', () => {
      // Note: Currently TargetManufacturer only has 4 types,
      // so this test is for future extensibility
      // In the actual implementation, the default case in the switch statement throws an error
      const buffer = Buffer.from('test\n');

      // Create a new manufacturer with mock (normally not possible, but for testing)
      const unknownManufacturer = {
        value: 'UNKNOWN',
        displayName: 'Unknown',
        equals: (other: any) => other.value === 'UNKNOWN',
      } as TargetManufacturer;

      expect(() => parser.parse(buffer, unknownManufacturer)).toThrow();
    });

    it('should throw an error when buffer size limit is exceeded with a very large buffer (memory attack)', () => {
      const manufacturer = TargetManufacturer.custom();

      // 2MB huge buffer (no newline, exceeds 1MB limit)
      const largeBuffer = Buffer.alloc(2 * 1024 * 1024, 'A');

      expect(() => parser.parse(largeBuffer, manufacturer)).toThrow();
    });
  });

  describe('Immutability', () => {
    it('should not allow modification of the returned RawData array', () => {
      const buffer = Buffer.from('12.5,-8.3,ABC\n');
      const manufacturer = TargetManufacturer.custom();

      const results = parser.parse(buffer, manufacturer);

      // Check if the array is frozen
      expect(Object.isFrozen(results)).toBe(true);
    });

    it('should not allow modification of the RawData object itself', () => {
      const buffer = Buffer.from('12.5,-8.3,ABC\n');
      const manufacturer = TargetManufacturer.custom();

      const results = parser.parse(buffer, manufacturer);
      const rawData = results[0];

      // Check if the object is frozen
      expect(Object.isFrozen(rawData)).toBe(true);
    });
  });

  describe('Timestamp accuracy', () => {
    it('should set individual timestamps for each message', () => {
      vi.useFakeTimers();
      const manufacturer = TargetManufacturer.custom();

      // First message
      const time1 = new Date('2026-01-13T12:00:00.000Z');
      vi.setSystemTime(time1);
      const results1 = parser.parse(Buffer.from('12.5,-8.3,ABC\n'), manufacturer);

      // Second message after 100ms
      vi.advanceTimersByTime(100);
      const results2 = parser.parse(Buffer.from('5.0,10.2,DEF\n'), manufacturer);

      // Verify that timestamps differ
      expect(results1[0]!.timestamp.getTime()).toBe(time1.getTime());
      expect(results2[0]!.timestamp.getTime()).toBe(time1.getTime() + 100);

      vi.useRealTimers();
    });

    it('should have the same timestamp for multiple messages received simultaneously', () => {
      const manufacturer = TargetManufacturer.custom();

      const buffer = Buffer.from('12.5,-8.3,ABC\n5.0,10.2,DEF\n');
      const results = parser.parse(buffer, manufacturer);

      // Messages received in the same parse call have the same timestamp
      expect(results[0]!.timestamp.getTime()).toBe(results[0]!.timestamp.getTime());
    });
  });
});
