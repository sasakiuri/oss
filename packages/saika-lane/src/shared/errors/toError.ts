// SPDX-License-Identifier: MIT
/**
 * Safely converts an unknown value to an Error instance.
 *
 * A utility for uniformly treating unknown values obtained in catch blocks and similar as Error.
 */
export function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  return new Error(String(value));
}
