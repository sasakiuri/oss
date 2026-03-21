// SPDX-License-Identifier: MIT
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { isDomainError } from '@/shared/errors/isDomainError';

/**
 * Converts MT201 raw coordinates to millimeters.
 */
export class MT201CoordinateConverter {
  private static readonly UNIT_DIVISOR = 150.0;

  /**
   * Converts a HEX string to a signed 16-bit integer.
   *
   * MT201 coordinates are represented as signed 16-bit integers (-32768 ~ +32767).
   * Values of 0x8000 or greater are treated as negative numbers (two's complement representation).
   *
   * @param hexString - HEX string (4 digits, e.g. "0250", "FF5F")
   * @returns Signed decimal integer
   * @throws VALIDATION_ERROR - If the HEX string is invalid
   */
  hexToSignedInt16(hexString: string): number {
    try {
      const value = parseInt(hexString, 16);

      if (Number.isNaN(value)) {
        throw ErrorCatalog.createError('VALIDATION_ERROR', {
          field: 'hexString',
          value: hexString,
          reason: 'Invalid HEX format',
        });
      }

      // Signed 16-bit conversion
      // If value >= 0x8000 (32768), treat as negative
      if (value >= 0x8000) {
        return value - 0x10000;
      }

      return value;
    } catch (error) {
      if (isDomainError(error)) {
        throw error;
      }

      throw ErrorCatalog.createError(
        'VALIDATION_ERROR',
        {
          field: 'hexString',
          value: hexString,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Convert raw coordinate value to millimeters.
   *
   * @param rawValue - Raw coordinate value (signed integer)
   * @returns Coordinate in mm units
   */
  rawToMm(rawValue: number): number {
    return rawValue / MT201CoordinateConverter.UNIT_DIVISOR;
  }

  /**
   * Creates an ImpactPoint from a HEX coordinate pair.
   *
   * @param xHex - X coordinate HEX string (4 digits)
   * @param yHex - Y coordinate HEX string (4 digits)
   * @returns ImpactPoint instance
   * @throws VALIDATION_ERROR - If coordinate values are invalid
   */
  toImpactPoint(xHex: string, yHex: string): ImpactPoint {
    const xRaw = this.hexToSignedInt16(xHex);
    const yRaw = this.hexToSignedInt16(yHex);
    const xMm = this.rawToMm(xRaw);
    const yMm = this.rawToMm(yRaw);
    return this.createImpactPoint(xMm, yMm);
  }

  /**
   * Creates an ImpactPoint from X/Y coordinates (with error handling).
   *
   * @param x - X coordinate (in mm units)
   * @param y - Y coordinate (in mm units)
   * @returns ImpactPoint instance
   * @throws VALIDATION_ERROR - If coordinate values are invalid (thrown by ImpactPoint constructor)
   */
  private createImpactPoint(x: number, y: number): ImpactPoint {
    try {
      return new ImpactPoint(x, y);
    } catch (error) {
      throw ErrorCatalog.createError(
        'VALIDATION_ERROR',
        {
          field: 'impactPoint',
          x,
          y,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        error instanceof Error ? error : undefined,
      );
    }
  }
}
