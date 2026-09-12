// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/** Immutable impact coordinates in millimeters from the target center. */
export class ImpactPoint {
  readonly x: number;

  readonly y: number;

  /** @throws If either coordinate is non-finite or outside ±1000 mm. */
  constructor(x: number, y: number) {
    if (!Number.isFinite(x)) {
      throw ErrorCatalog.createError('INVALID_IMPACT_POINT', { detail: 'X coordinate must be a finite number' });
    }
    if (!Number.isFinite(y)) {
      throw ErrorCatalog.createError('INVALID_IMPACT_POINT', { detail: 'Y coordinate must be a finite number' });
    }

    if (x > 1000 || x < -1000) {
      throw ErrorCatalog.createError('INVALID_IMPACT_POINT', { detail: 'X coordinate must be within ±1000mm' });
    }
    if (y > 1000 || y < -1000) {
      throw ErrorCatalog.createError('INVALID_IMPACT_POINT', { detail: 'Y coordinate must be within ±1000mm' });
    }

    this.x = x;
    this.y = y;

    Object.freeze(this);
  }

  /** Squared distance in mm² for comparisons in TargetDesign, without square-root rounding. */
  distanceSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  /** Distance from the target center in millimeters. */
  distanceFromCenter(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  equals(other: ImpactPoint): boolean {
    return this.x === other.x && this.y === other.y;
  }
}
