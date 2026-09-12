// SPDX-License-Identifier: MIT
/** Converts an unknown caught value to an Error. */

export function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  return new Error(String(value));
}
