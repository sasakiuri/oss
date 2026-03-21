// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { isDomainError } from '@/shared/errors/isDomainError';

/**
 * Interface for MT201 parse results
 */
export interface MT201ParsedData {
  mode: string;
  score: number;
  xHex: string;
  yHex: string;
  checksum: string;
}

/**
 * Parses raw data strings from MT201 device.
 */
export class MT201DataParser {
  /**
   * Parses MT201 data.
   *
   * Format: "R 9.7 0250 FF5F 70" or "R10.9 0250 FF5F 70"
   * - Mode: R/S (1 character)
   * - Score: numeric value (integer part + decimal point + fractional part, flexible whitespace handling)
   * - X coordinate: HEX 4 digits (case-insensitive)
   * - Y coordinate: HEX 4 digits (case-insensitive)
   * - Checksum: HEX 2 digits (case-insensitive)
   *
   * Uses a regular expression to parse the whole string, so it is tolerant of whitespace variation
   * and also handles space-less formats like "R10.9".
   *
   * @param buffer - Buffer containing MT201 data
   * @returns Parse result (mode, score, X/Y coordinate HEX, checksum)
   * @throws DATA_CONVERSION_ERROR - If the data format is invalid
   */
  parse(buffer: Buffer): MT201ParsedData {
    try {
      // Convert Buffer to string (ASCII/UTF-8)
      const dataString = buffer.toString('utf-8').trim();

      // Parse MT201 data using a regular expression
      // Format: "R 9.7 0250 FF5F 70" or "R10.9 0250 FF5F 70"
      // - Mode: R/S (1 character)
      // - Score: numeric value (integer part + decimal point + fractional part, flexible whitespace handling)
      // - X coordinate: HEX 4 digits (case-insensitive)
      // - Y coordinate: HEX 4 digits (case-insensitive)
      // - Checksum: HEX 2 digits (case-insensitive)
      //
      // Match with a more permissive pattern; detailed errors are returned in subsequent validation
      const pattern = /^([A-Z])\s*([\d.\-a-z]+)\s+([0-9A-Za-z\s]{3,4})\s+([0-9A-Za-z]{4})\s+([0-9A-Za-z]{2})\s*$/i;
      const match = dataString.match(pattern);

      if (!match) {
        throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
          reason: 'MT201 data format mismatch',
          receivedFormat: dataString,
        });
      }

      // Extract each matched group
      const mode = match[1]!;
      const scoreStr = match[2]!;
      const xHex = match[3]!;
      const yHex = match[4]!;
      const checksum = match[5]!;

      // Mode validation (R/S) - stricter validation
      if (mode !== 'R' && mode !== 'S') {
        throw ErrorCatalog.createError('VALIDATION_ERROR', {
          field: 'mode',
          value: mode,
          expected: 'R or S',
        });
      }

      // Parse score - validate numeric format (negative numbers are also allowed; validated later by Score constructor)
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

      // Validate HEX format of X coordinate
      const xHexTrimmed = xHex.trim().toUpperCase();
      if (!/^[0-9A-F]{4}$/.test(xHexTrimmed)) {
        throw ErrorCatalog.createError('VALIDATION_ERROR', {
          field: 'xHex',
          value: xHex,
          expected: '4-digit HEX string',
        });
      }

      // Validate HEX format of Y coordinate
      const yHexTrimmed = yHex.toUpperCase();
      if (!/^[0-9A-F]{4}$/.test(yHexTrimmed)) {
        throw ErrorCatalog.createError('VALIDATION_ERROR', {
          field: 'yHex',
          value: yHex,
          expected: '4-digit HEX string',
        });
      }

      // Validate HEX format of checksum
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
      // Re-throw DomainError as-is
      if (isDomainError(error)) {
        throw error;
      }

      // Wrap other errors in DATA_CONVERSION_ERROR
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
