// SPDX-License-Identifier: MIT
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { isDomainError } from '@/shared/errors/isDomainError';

export class MT201CoordinateConverter {
  /** Raw coordinate units per millimetre. */
  private static readonly UNIT_DIVISOR = 150.0;

  /**
   * Interprets coordinates as signed 16-bit two's complement values.
   * The caller validates the four-digit hexadecimal field.
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

  rawToMm(rawValue: number): number {
    return rawValue / MT201CoordinateConverter.UNIT_DIVISOR;
  }

  toImpactPoint(xHex: string, yHex: string): ImpactPoint {
    const xRaw = this.hexToSignedInt16(xHex);
    const yRaw = this.hexToSignedInt16(yHex);
    const xMm = this.rawToMm(xRaw);
    const yMm = this.rawToMm(yRaw);
    return this.createImpactPoint(xMm, yMm);
  }

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
