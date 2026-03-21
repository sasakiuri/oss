// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * TargetManufacturer value object
 *
 * Immutable object representing a manufacturer of electronic targets.
 * Each manufacturer has its own data format.
 */
export class TargetManufacturer {
  /**
   * Manufacturer value (SIUS | MEYTON | DISAG | CUSTOM | KOHTO)
   */
  readonly value: string;

  /**
   * Display name
   */
  readonly displayName: string;

  /**
   * Creates a TargetManufacturer (private constructor pattern).
   *
   * @param value - Manufacturer value
   * @param displayName - Display name
   */
  private constructor(value: string, displayName: string) {
    this.value = value;
    this.displayName = displayName;

    // Guarantee immutability: freeze the object
    Object.freeze(this);
  }

  /**
   * Creates a SIUS manufacturer instance.
   *
   * @returns SIUS manufacturer instance
   */
  static sius(): TargetManufacturer {
    return new TargetManufacturer('SIUS', 'SIUS');
  }

  /**
   * Creates a Meyton manufacturer instance.
   *
   * @returns Meyton manufacturer instance
   */
  static meyton(): TargetManufacturer {
    return new TargetManufacturer('MEYTON', 'Meyton');
  }

  /**
   * Creates a DISAG manufacturer instance.
   *
   * @returns DISAG manufacturer instance
   */
  static disag(): TargetManufacturer {
    return new TargetManufacturer('DISAG', 'DISAG');
  }

  /**
   * Creates a Custom manufacturer instance.
   *
   * @returns Custom manufacturer instance
   */
  static custom(): TargetManufacturer {
    return new TargetManufacturer('CUSTOM', 'Custom');
  }

  /**
   * Creates a Kohto Electronics (KOHTO) manufacturer instance.
   *
   * @returns Kohto Electronics manufacturer instance
   */
  static kohto(): TargetManufacturer {
    return new TargetManufacturer('KOHTO', 'Kohto Electronics');
  }

  /**
   * Checks equality with another TargetManufacturer.
   *
   * @param other - TargetManufacturer to compare against
   * @returns true if equal, false otherwise
   */
  equals(other: TargetManufacturer): boolean {
    return this.value === other.value;
  }

  /**
   * Reconstructs a TargetManufacturer from a string value.
   *
   * @param value - Manufacturer value (SIUS | MEYTON | DISAG | CUSTOM | KOHTO)
   * @returns TargetManufacturer instance
   * @throws {Error} If the value is invalid
   */
  static fromValue(value: string): TargetManufacturer {
    const mapping: { [key: string]: () => TargetManufacturer } = {
      SIUS: () => TargetManufacturer.sius(),
      MEYTON: () => TargetManufacturer.meyton(),
      DISAG: () => TargetManufacturer.disag(),
      CUSTOM: () => TargetManufacturer.custom(),
      KOHTO: () => TargetManufacturer.kohto(),
    };

    const factory = mapping[value];
    if (!factory) {
      throw ErrorCatalog.createError('UNKNOWN_MANUFACTURER', { detail: `Unknown manufacturer value: ${value}` });
    }

    return factory();
  }
}
