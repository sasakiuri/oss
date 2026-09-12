// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/** Sighting shots are used for aim adjustment; match shots count toward the result. */
export class Mode {
  readonly value: 'SIGHTING' | 'MATCH';

  readonly displayName: string;

  private constructor(value: 'SIGHTING' | 'MATCH', displayName: string) {
    this.value = value;
    this.displayName = displayName;

    Object.freeze(this);
  }

  static sighting(): Mode {
    return new Mode('SIGHTING', 'Sighting');
  }

  static match(): Mode {
    return new Mode('MATCH', 'Match');
  }

  isSighting(): boolean {
    return this.value === 'SIGHTING';
  }

  isMatch(): boolean {
    return this.value === 'MATCH';
  }

  equals(other: Mode): boolean {
    return this.value === other.value;
  }

  /**
   * Reconstructs a Mode from a string value
   *
   * @param value - Mode value (SIGHTING | MATCH)
   * @returns Mode instance
   * @throws {Error} If the value is invalid
   */
  static fromValue(value: string): Mode {
    if (value === 'SIGHTING') {
      return Mode.sighting();
    } else if (value === 'MATCH') {
      return Mode.match();
    } else {
      throw ErrorCatalog.createError('UNKNOWN_MODE', { detail: `Unknown mode value: ${value}` });
    }
  }
}
