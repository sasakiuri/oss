// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { isDomainError } from '@/shared/errors/isDomainError';

export interface MT201ParsedData {
  mode: string;
  score: number;
  xHex: string;
  yHex: string;
  checksum: string;
}

export class MT201DataParser {
  parse(buffer: Buffer): MT201ParsedData {
    try {
      const dataString = buffer.toString('utf-8').trim();

      // Accept candidate fields here; report field-specific errors below.
      const pattern = /^([A-Z])\s*([\d.\-a-z]+)\s+([0-9A-Za-z\s]{3,4})\s+([0-9A-Za-z]{4})\s+([0-9A-Za-z]{2})\s*$/i;
      const match = dataString.match(pattern);

      if (!match) {
        throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
          reason: 'MT201 data format mismatch',
          receivedFormat: dataString,
        });
      }

      const mode = match[1]!;
      const scoreStr = match[2]!;
      const xHex = match[3]!;
      const yHex = match[4]!;
      const checksum = match[5]!;

      if (mode !== 'R' && mode !== 'S') {
        throw ErrorCatalog.createError('VALIDATION_ERROR', {
          field: 'mode',
          value: mode,
          expected: 'R or S',
        });
      }

      // The Score constructor checks the numeric range after parsing.
      if (!/^-?[\d.]+$/.test(scoreStr)) {
        throw ErrorCatalog.createError('VALIDATION_ERROR', {
          field: 'score',
          value: scoreStr,
        });
      }

      const score = parseFloat(scoreStr);
      if (!Number.isFinite(score)) {
        throw ErrorCatalog.createError('VALIDATION_ERROR', {
          field: 'score',
          value: scoreStr,
        });
      }

      const xHexTrimmed = xHex.trim().toUpperCase();
      if (!/^[0-9A-F]{4}$/.test(xHexTrimmed)) {
        throw ErrorCatalog.createError('VALIDATION_ERROR', {
          field: 'xHex',
          value: xHex,
          expected: '4-digit HEX string',
        });
      }

      const yHexTrimmed = yHex.toUpperCase();
      if (!/^[0-9A-F]{4}$/.test(yHexTrimmed)) {
        throw ErrorCatalog.createError('VALIDATION_ERROR', {
          field: 'yHex',
          value: yHex,
          expected: '4-digit HEX string',
        });
      }

      // Only the checksum's format is checked; its value is not verified.
      const checksumTrimmed = checksum.toUpperCase();
      if (!/^[0-9A-F]{2}$/.test(checksumTrimmed)) {
        throw ErrorCatalog.createError('VALIDATION_ERROR', {
          field: 'checksum',
          value: checksum,
          expected: '2-digit HEX string',
        });
      }

      return {
        mode,
        score,
        xHex: xHexTrimmed,
        yHex: yHexTrimmed,
        checksum: checksumTrimmed,
      };
    } catch (error) {
      if (isDomainError(error)) {
        throw error;
      }

      throw ErrorCatalog.createError(
        'DATA_CONVERSION_ERROR',
        {
          stage: 'MT201 data parsing',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        error instanceof Error ? error : undefined,
      );
    }
  }
}
