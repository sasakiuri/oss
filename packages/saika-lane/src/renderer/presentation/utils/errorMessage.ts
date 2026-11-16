// SPDX-License-Identifier: MIT
/** The message of a caught value: an Error's message, otherwise `fallback`, or the value as text. */
export function errorMessage(error: unknown, fallback?: string): string {
  if (error instanceof Error) return error.message;
  return fallback ?? String(error);
}
