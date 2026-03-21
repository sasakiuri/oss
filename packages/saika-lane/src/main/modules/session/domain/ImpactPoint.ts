// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * ImpactPoint value object
 *
 * An immutable object representing the X and Y coordinates of an impact point.
 * Can calculate the distance from the center and check equality with other ImpactPoints.
 */
export class ImpactPoint {
  /**
   * X coordinate (in mm, distance from center)
   */
  readonly x: number;

  /**
   * Y coordinate (in mm, distance from center)
   */
  readonly y: number;

  /**
   * Creates an ImpactPoint
   *
   * @param x - X coordinate (in mm)
   * @param y - Y coordinate (in mm)
   * @throws {Error} If the coordinate is not a finite number
   * @throws {Error} If the coordinate exceeds ±1000mm
   */
  constructor(x: number, y: number) {
    // Invariant: x and y must be finite numbers
    if (!Number.isFinite(x)) {
      throw ErrorCatalog.createError('INVALID_IMPACT_POINT', { detail: 'X coordinate must be a finite number' });
    }
    if (!Number.isFinite(y)) {
      throw ErrorCatalog.createError('INVALID_IMPACT_POINT', { detail: 'Y coordinate must be a finite number' });
    }

    // Invariant: coordinate values must not be extremely large (within ±1000mm)
    if (x > 1000 || x < -1000) {
      throw ErrorCatalog.createError('INVALID_IMPACT_POINT', { detail: 'X coordinate must be within ±1000mm' });
    }
    if (y > 1000 || y < -1000) {
      throw ErrorCatalog.createError('INVALID_IMPACT_POINT', { detail: 'Y coordinate must be within ±1000mm' });
    }

    this.x = x;
    this.y = y;

    // Guarantee immutability: freeze the object
    Object.freeze(this);
  }

  /**
   * Calculates the squared distance from the center
   *
   * Avoids sqrt to improve floating-point precision.
   * Used for distance² comparisons in TargetDesign.
   *
   * @returns Squared distance from center (in mm²)
   */
  distanceSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  /**
   * Calculates the distance from the center
   *
   * Used for log output in ScoreDiscrepancyDetector.
   *
   * @returns Distance from center (in mm)
   */
  distanceFromCenter(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  /**
   * Checks equality with another ImpactPoint
   *
   * @param other - The ImpactPoint to compare against
   * @returns true if equal, false otherwise
   */
  equals(other: ImpactPoint): boolean {
    return this.x === other.x && this.y === other.y;
  }
}
