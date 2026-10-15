// SPDX-License-Identifier: MIT
import { isRecord } from "../text.ts";

import type { SQLRow, SQLValue } from "./sql.ts";

export function encode(value: unknown): string {
  return JSON.stringify(value);
}

export function byKey(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Key-order independent encoding, used to detect changed rows like a deep equality. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => byKey(a, b)))
      : item,
  );
}

function column(row: SQLRow | undefined, name: string): SQLValue {
  if (!row || !(name in row)) throw new Error(`Missing column ${name}`);
  return row[name] ?? null;
}

export function textColumn(row: SQLRow | undefined, name: string): string {
  const value = column(row, name);
  if (typeof value !== "string") throw new Error(`Column ${name} is not text`);
  return value;
}

export function numberColumn(row: SQLRow | undefined, name: string): number {
  const value = column(row, name);
  if (typeof value !== "number")
    throw new Error(`Column ${name} is not numeric`);
  return value;
}

/** Stored JSON documents acquire their repository types only here. */
export function decode<T>(data: string): T {
  return JSON.parse(data) as T;
}
