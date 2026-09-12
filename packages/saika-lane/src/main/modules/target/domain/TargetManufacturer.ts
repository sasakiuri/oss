// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/** Electronic-target manufacturer identifier and display name. */
export class TargetManufacturer {
  /**
   * Manufacturer value (SIUS | MEYTON | DISAG | CUSTOM | KOHTO)
   */
  readonly value: string;

  readonly displayName: string;

  private constructor(value: string, displayName: string) {
    this.value = value;
    this.displayName = displayName;

    Object.freeze(this);
  }

  static sius(): TargetManufacturer {
    return new TargetManufacturer('SIUS', 'SIUS');
  }

  static meyton(): TargetManufacturer {
    return new TargetManufacturer('MEYTON', 'Meyton');
  }

  static disag(): TargetManufacturer {
    return new TargetManufacturer('DISAG', 'DISAG');
  }

  static custom(): TargetManufacturer {
    return new TargetManufacturer('CUSTOM', 'Custom');
  }

  static kohto(): TargetManufacturer {
    return new TargetManufacturer('KOHTO', 'Kohto Electronics');
  }

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
