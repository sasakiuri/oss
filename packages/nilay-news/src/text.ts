// SPDX-License-Identifier: MIT
/** Code-point based string limits and whitespace rules shared by collectors and storage. */

/** Unicode whitespace and ASCII information separators used by source text. */
export const SPACE =
  "\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const SPACE_RUN = new RegExp(`[${SPACE}]+`, "g");
const EDGES = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, "g");

export function strip(value: string): string {
  return value.replace(EDGES, "");
}

/** Collapse whitespace runs to one space and trim the result. */
export function clean(value: string): string {
  return strip(value.replace(SPACE_RUN, " "));
}

/** Split on whitespace runs, dropping empty fields. */
export function words(value: string): string[] {
  return value.split(SPACE_RUN).filter(Boolean);
}

export function length(value: string): number {
  let count = 0;
  for (const _ of value) count += 1;
  return count;
}

/** Keep the first `limit` code points, never splitting a surrogate pair. */
export function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  let result = "";
  let count = 0;
  for (const char of value) {
    if (count === limit) break;
    result += char;
    count += 1;
  }
  return result;
}

/** Drop the last `count` code points. */
export function dropEnd(value: string, count: number): string {
  const chars = [...value];
  return chars.slice(0, Math.max(0, chars.length - count)).join("");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

const encoder = new TextEncoder();

export function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let result = "";
  for (const byte of view) result += byte.toString(16).padStart(2, "0");
  return result;
}

export async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", utf8(value)));
}

export function randomToken(): string {
  return crypto.randomUUID().replaceAll("-", "");
}
