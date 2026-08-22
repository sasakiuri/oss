// SPDX-License-Identifier: MIT
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';

/** Converts decoded BPT-216 signed coordinate units (0.01 mm) to millimeters. */
export class BPT216CoordinateConverter {
  private static readonly UNITS_PER_MILLIMETER = 100;

  toImpactPoint(xRaw: number, yRaw: number): ImpactPoint {
    return new ImpactPoint(
      xRaw / BPT216CoordinateConverter.UNITS_PER_MILLIMETER,
      yRaw / BPT216CoordinateConverter.UNITS_PER_MILLIMETER,
    );
  }
}
