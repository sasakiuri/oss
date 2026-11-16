// SPDX-License-Identifier: MIT
/**
 * Field validators for domain records and commands. Their error messages reach
 * MQTT acknowledgements; keep each text unchanged.
 */

/** Trims a required text; throws "<name> is required" when it is blank. */
export function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

/** Trims an optional text; blank becomes null. */
export function optionalText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** Throws "<name> must be a positive integer" unless the value is an integer above zero. */
export function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

/** Throws "<name> must be a non-negative integer" unless the value is an integer of zero or more. */
export function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

/** Copies a valid date; throws "<name> must be a valid date". */
export function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be a valid date`);
  return new Date(value.getTime());
}

/** Copies a valid date; throws "<name> must be valid". */
export function validTime(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}
