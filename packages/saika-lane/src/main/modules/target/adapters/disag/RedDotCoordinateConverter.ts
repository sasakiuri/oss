// SPDX-License-Identifier: MIT

export interface RedDotCoordinates {
  readonly xMm: number;
  readonly yMm: number;
}

/** Converts RedDot coordinate units (0.01 mm) to millimeters. */
export class RedDotCoordinateConverter {
  static readonly RAW_UNITS_PER_MM = 100;

  convert(xRaw: number, yRaw: number): RedDotCoordinates {
    return Object.freeze({
      xMm: xRaw / RedDotCoordinateConverter.RAW_UNITS_PER_MM,
      yMm: yRaw / RedDotCoordinateConverter.RAW_UNITS_PER_MM,
    });
  }
}
