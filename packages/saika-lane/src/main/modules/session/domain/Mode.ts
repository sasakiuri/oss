// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * Mode (sighting/match mode) value object
 *
 * An immutable object representing the mode (sighting or match) in a shooting session.
 * In sighting mode, shots are fired for aim adjustment; in match mode, shots are treated as records.
 */
export class Mode {
  /**
   * Mode value (SIGHTING | MATCH)
   */
  readonly value: 'SIGHTING' | 'MATCH';

  /**
   * Display name
   */
  readonly displayName: string;

  /**
   * Creates a Mode (private constructor pattern)
   *
   * @param value - Mode value
   * @param displayName - Display name
   */
  private constructor(value: 'SIGHTING' | 'MATCH', displayName: string) {
    this.value = value;
    this.displayName = displayName;

    // Guarantee immutability: freeze the object
    Object.freeze(this);
  }

  /**
   * Creates a sighting mode instance
   *
   * @returns Sighting mode instance
   */
  static sighting(): Mode {
    return new Mode('SIGHTING', 'Sighting');
  }

  /**
   * Creates a match mode instance
   *
   * @returns Match mode instance
   */
  static match(): Mode {
    return new Mode('MATCH', 'Match');
  }

  /**
   * Determines whether this is sighting mode
   *
   * @returns true if sighting mode, false otherwise
   */
  isSighting(): boolean {
    return this.value === 'SIGHTING';
  }

  /**
   * Determines whether this is match mode
   *
   * @returns true if match mode, false otherwise
   */
  isMatch(): boolean {
    return this.value === 'MATCH';
  }

  /**
   * Checks equality with another Mode
   *
   * @param other - The Mode to compare against
   * @returns true if equal, false otherwise
   */
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
