// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * Discipline value object
 *
 * An immutable object representing a shooting discipline.
 * Each discipline has characteristics such as shooting distance and target size.
 */
export class Discipline {
  /**
   * Discipline value (AIR_RIFLE_10M | AIR_PISTOL_10M | RIFLE_50M | PISTOL_25M | BEAM_RIFLE_10M | BEAM_PISTOL_10M)
   */
  readonly value: string;

  /**
   * Display name
   */
  readonly displayName: string;

  /**
   * Shooting distance (in meters)
   */
  readonly distance: number;

  /**
   * Target size (in mm)
   */
  readonly targetSize: number;

  /**
   * Creates a Discipline (private constructor pattern)
   *
   * @param value - Discipline value
   * @param displayName - Display name
   * @param distance - Shooting distance (in meters)
   * @param targetSize - Target size (in mm)
   */
  private constructor(value: string, displayName: string, distance: number, targetSize: number) {
    this.value = value;
    this.displayName = displayName;
    this.distance = distance;
    this.targetSize = targetSize;

    // Guarantee immutability: freeze the object
    Object.freeze(this);
  }

  /**
   * Creates a 10m Air Rifle instance
   *
   * @returns 10m Air Rifle instance
   */
  static airRifle10m(): Discipline {
    return new Discipline('AIR_RIFLE_10M', '10m Air Rifle', 10, 170.0);
  }

  /**
   * Creates a 10m Air Pistol instance
   *
   * @returns 10m Air Pistol instance
   */
  static airPistol10m(): Discipline {
    return new Discipline('AIR_PISTOL_10M', '10m Air Pistol', 10, 170.0);
  }

  /**
   * Creates a 50m Rifle instance
   *
   * @returns 50m Rifle instance
   */
  static rifle50m(): Discipline {
    return new Discipline('RIFLE_50M', '50m Rifle', 50, 250.0);
  }

  /**
   * Creates a 25m Pistol instance
   *
   * @returns 25m Pistol instance
   */
  static pistol25m(): Discipline {
    return new Discipline('PISTOL_25M', '25m Pistol', 25, 500);
  }

  /**
   * Creates a 10m Beam Rifle instance
   *
   * @returns 10m Beam Rifle instance
   */
  static beamRifle10m(): Discipline {
    return new Discipline('BEAM_RIFLE_10M', '10m Beam Rifle', 10, 170.0);
  }

  /**
   * Creates a 10m Beam Pistol instance
   *
   * @returns 10m Beam Pistol instance
   */
  static beamPistol10m(): Discipline {
    return new Discipline('BEAM_PISTOL_10M', '10m Beam Pistol', 10, 170.0);
  }

  /**
   * Checks equality with another Discipline
   *
   * @param other - The Discipline to compare against
   * @returns true if equal, false otherwise
   */
  equals(other: Discipline): boolean {
    return this.value === other.value;
  }

  /**
   * Reconstructs a Discipline from a string value
   *
   * @param value - Discipline value (AR60, AP60, R50M, P25M, BR60S, BP60, AIR_RIFLE_10M, AIR_PISTOL_10M, RIFLE_50M, PISTOL_25M, BEAM_RIFLE_10M, BEAM_PISTOL_10M)
   * @returns Discipline instance
   * @throws {Error} If the value is invalid
   */
  static fromValue(value: string): Discipline {
    // Mapping from short form to standard form
    const mapping: { [key: string]: () => Discipline } = {
      AR60: () => Discipline.airRifle10m(),
      AIR_RIFLE_10M: () => Discipline.airRifle10m(),
      AP60: () => Discipline.airPistol10m(),
      AIR_PISTOL_10M: () => Discipline.airPistol10m(),
      R50M: () => Discipline.rifle50m(),
      RIFLE_50M: () => Discipline.rifle50m(),
      P25M: () => Discipline.pistol25m(),
      PISTOL_25M: () => Discipline.pistol25m(),
      BR60S: () => Discipline.beamRifle10m(),
      BEAM_RIFLE_10M: () => Discipline.beamRifle10m(),
      BP60: () => Discipline.beamPistol10m(),
      BEAM_PISTOL_10M: () => Discipline.beamPistol10m(),
    };

    const factory = mapping[value];
    if (!factory) {
      throw ErrorCatalog.createError('UNKNOWN_DISCIPLINE', { detail: `Unknown discipline value: ${value}` });
    }

    return factory();
  }
}
