// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import type { Discipline as DisciplineCode } from '@/shared/ipc/schemas/common';

/** Immutable shooting discipline with distance and target dimensions. */
export class Discipline {
  readonly value: DisciplineCode;

  readonly displayName: string;

  /** Shooting distance in meters. */
  readonly distance: number;

  /** Target size in millimeters. */
  readonly targetSize: number;

  private constructor(value: DisciplineCode, displayName: string, distance: number, targetSize: number) {
    this.value = value;
    this.displayName = displayName;
    this.distance = distance;
    this.targetSize = targetSize;

    Object.freeze(this);
  }

  static airRifle10m(): Discipline {
    return new Discipline('AIR_RIFLE_10M', '10m Air Rifle', 10, 170.0);
  }

  static airPistol10m(): Discipline {
    return new Discipline('AIR_PISTOL_10M', '10m Air Pistol', 10, 170.0);
  }

  static rifle50m(): Discipline {
    return new Discipline('RIFLE_50M', '50m Rifle', 50, 250.0);
  }

  static rifle300m(): Discipline {
    return new Discipline('RIFLE_300M', '300m Rifle', 300, 1300);
  }

  static pistol50m(): Discipline {
    return new Discipline('PISTOL_50M', '50m Pistol', 50, 550);
  }

  static pistol25m(): Discipline {
    return new Discipline('PISTOL_25M', '25m Pistol', 25, 500);
  }

  static beamRifle10m(): Discipline {
    return new Discipline('BEAM_RIFLE_10M', '10m Beam Rifle', 10, 170.0);
  }

  static beamPistol10m(): Discipline {
    return new Discipline('BEAM_PISTOL_10M', '10m Beam Pistol', 10, 170.0);
  }

  equals(other: Discipline): boolean {
    return this.value === other.value;
  }

  /**
   * Accepts discipline codes and their short forms (for example, AIR_RIFLE_10M and AR60).
   * @throws If the discipline is unknown.
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
      RIFLE_300M: () => Discipline.rifle300m(),
      PISTOL_50M: () => Discipline.pistol50m(),
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
