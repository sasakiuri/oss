// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

export interface BPT216ParsedData {
  readonly scoreTenths: number;
  readonly xRaw: number;
  readonly yRaw: number;
  readonly reserved1?: string;
  readonly reserved2?: string;
  readonly checksum?: string;
  readonly version?: string;
}

/** Parses one terminal-shot ASCII frame emitted by either BPT-216 connection path. */
export class BPT216DataParser {
  parse(buffer: Buffer): BPT216ParsedData {
    if (buffer.length === 0 || Array.from(buffer).some((byte) => byte < 0x20 || byte > 0x7e)) {
      throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
        reason: 'BPT-216 frame must be printable ASCII without line terminators',
      });
    }

    const frame = buffer.toString('ascii').trim();
    if (frame.startsWith('P')) {
      return this.parseRs232Frame(frame);
    }

    return this.parseBp217InterfaceFrame(frame);
  }

  private parseBp217InterfaceFrame(frame: string): BPT216ParsedData {
    const fields = frame.split(',').map((field) => field.trim());
    if (fields.length < 6) {
      throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
        reason: 'BPT-216 frame must contain at least six comma-separated fields',
        fieldCount: fields.length,
      });
    }

    const [scoreText, xText, yText, reserved1, reserved2, stateText, version] = fields;
    const scoreTenths = this.parseScore(scoreText);

    const xRaw = this.parseDecimalCoordinate(xText, 'x');
    const yRaw = this.parseDecimalCoordinate(yText, 'y');
    if (stateText !== 'T') {
      throw ErrorCatalog.createError('VALIDATION_ERROR', {
        field: 'state',
        value: stateText ?? '',
        expected: 'T (terminal shot)',
      });
    }
    if (xRaw === 9999) {
      throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
        reason: 'BPT-216 status sentinel cannot be converted as a shot',
      });
    }

    return Object.freeze({
      scoreTenths,
      xRaw,
      yRaw,
      reserved1: reserved1 ?? '',
      reserved2: reserved2 ?? '',
      ...(version === undefined || version === '' ? {} : { version }),
    });
  }

  private parseRs232Frame(frame: string): BPT216ParsedData {
    const match = frame.match(/^P( [0-9]\.[0-9]|10\.[0-9]) ([0-9A-F]{4}) ([0-9A-F]{4}) ([0-9A-F]{2})$/i);
    if (!match) {
      throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
        reason: 'BPT-216 RS-232C frame format mismatch',
        receivedFormat: frame,
      });
    }

    const [, scoreText, xHex, yHex, checksum] = match;
    const normalizedChecksum = checksum!.toUpperCase();
    const expectedChecksum = this.calculateRs232Checksum(frame.slice(0, -normalizedChecksum.length));
    if (normalizedChecksum !== expectedChecksum) {
      throw ErrorCatalog.createError('VALIDATION_ERROR', {
        field: 'checksum',
        value: normalizedChecksum,
        expected: expectedChecksum,
      });
    }

    return Object.freeze({
      scoreTenths: this.parseScore(scoreText?.trim()),
      xRaw: this.parseSignedInt16(xHex!),
      yRaw: this.parseSignedInt16(yHex!),
      checksum: normalizedChecksum,
    });
  }

  private parseScore(value: string | undefined): number {
    if (!value || !/^(?:0|[1-9]|10)(?:\.\d{1,2})?$/.test(value)) {
      throw ErrorCatalog.createError('VALIDATION_ERROR', {
        field: 'score',
        value: value ?? '',
        expected: '0.0 through 10.9 in 0.1-point increments',
      });
    }

    const scoreValue = Number(value);
    const parsedScoreTenths = Math.round(scoreValue * 10);
    if (parsedScoreTenths < 0 || parsedScoreTenths > 109 || Math.abs(scoreValue * 10 - parsedScoreTenths) > 1e-9) {
      throw ErrorCatalog.createError('VALIDATION_ERROR', {
        field: 'score',
        value,
        expected: '0.0 through 10.9 in 0.1-point increments',
      });
    }

    // The official V201 application treats every value below the 1-ring as a miss.
    return parsedScoreTenths < 10 ? 0 : parsedScoreTenths;
  }

  private parseDecimalCoordinate(value: string | undefined, field: 'x' | 'y'): number {
    if (!value || !/^[+-]?\d+$/.test(value)) {
      throw ErrorCatalog.createError('VALIDATION_ERROR', {
        field,
        value: value ?? '',
        expected: 'signed decimal integer in 0.01 mm units',
      });
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw ErrorCatalog.createError('VALIDATION_ERROR', {
        field,
        value,
        expected: 'safe signed decimal integer',
      });
    }
    return parsed;
  }

  private parseSignedInt16(value: string): number {
    const unsigned = Number.parseInt(value, 16);
    return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
  }

  private calculateRs232Checksum(payload: string): string {
    const sum = Buffer.from(payload, 'ascii').reduce((checksum, byte) => (checksum + byte) & 0xff, 0);
    return sum.toString(16).toUpperCase().padStart(2, '0');
  }
}
