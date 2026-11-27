// SPDX-License-Identifier: MIT

/** Returns the trimmed text, or throws `<name> is required` when nothing remains. */
export function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

/** Returns the trimmed text, or null when it is missing or blank. */
export function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

/** Returns a copy of the date, or throws `<name> must be valid` for an invalid date. */
export function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}

/** Returns the value, or throws `<name> must be a SHA-256 digest` unless it is 64 lowercase hexadecimal characters. */
export function sha256Digest(value: string, name: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${name} must be a SHA-256 digest`);
  return value;
}
