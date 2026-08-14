// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

export interface BPT216ParsedData {
  readonly scoreTenths: number;
  readonly xRaw: number;
  readonly yRaw: number;
  readonly reserved1: string;
  readonly reserved2: string;
  readonly version?: string;
}

/** Parses one terminal-shot ASCII frame emitted by a Kohto BPT-216. */
export class BPT216DataParser {
  parse(buffer: Buffer): BPT216ParsedData {
    if (buffer.length === 0 || Array.from(buffer).some((byte) => byte < 0x20 || byte > 0x7e)) {
      throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
        reason: 'BPT-216 frame must be printable ASCII without line terminators',
      });
    }

    const frame = buffer.toString('ascii').trim();
    const fields = frame.split(',').map((field) => field.trim());
    if (fields.length < 6) {
      throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
        reason: 'BPT-216 frame must contain at least six comma-separated fields',
        fieldCount: fields.length,
      });
    }

    const [scoreText, xText, yText, reserved1, reserved2, stateText, version] = fields;
    if (!scoreText || !/^(?:0|[1-9]|10)(?:\.\d{1,2})?$/.test(scoreText)) {
      throw ErrorCatalog.createError('VALIDATION_ERROR', {
        field: 'score',
        value: scoreText ?? '',
        expected: '0.0 through 10.9 in 0.1-point increments',
      });
    }

    const scoreValue = Number(scoreText);
    const parsedScoreTenths = Math.round(scoreValue * 10);
    if (parsedScoreTenths < 0 || parsedScoreTenths > 109 || Math.abs(scoreValue * 10 - parsedScoreTenths) > 1e-9) {
      throw ErrorCatalog.createError('VALIDATION_ERROR', {
        field: 'score',
        value: scoreText,
        expected: '0.0 through 10.9 in 0.1-point increments',
      });
    }
    // The official V201 application treats every value below the 1-ring as a miss.
    const scoreTenths = parsedScoreTenths < 10 ? 0 : parsedScoreTenths;

    const xRaw = this.parseCoordinate(xText, 'x');
    const yRaw = this.parseCoordinate(yText, 'y');
    if (stateText !== 'T') {
      throw ErrorCatalog.createError('VALIDATION_ERROR', {
        field: 'state',
        value: stateText ?? '',
        expected: 'T (terminal shot)',
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

  private parseCoordinate(value: string | undefined, field: 'x' | 'y'): number {
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
}
