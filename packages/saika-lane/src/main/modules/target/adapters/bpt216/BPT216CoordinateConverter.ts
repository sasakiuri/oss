// SPDX-License-Identifier: MIT
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';

/** Converts BPT-216 signed decimal coordinates (0.01 mm) to millimetres. */
export class BPT216CoordinateConverter {
  private static readonly UNITS_PER_MILLIMETRE = 100;

  toImpactPoint(xRaw: number, yRaw: number): ImpactPoint {
    return new ImpactPoint(
      xRaw / BPT216CoordinateConverter.UNITS_PER_MILLIMETRE,
      yRaw / BPT216CoordinateConverter.UNITS_PER_MILLIMETRE,
    );
  }
}
