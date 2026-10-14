// SPDX-License-Identifier: MIT
export type SQLValue = string | number | null;
export type SQLStatement = readonly [string, readonly SQLValue[]];
export type SQLRow = Record<string, SQLValue>;
export interface SQLResult {
  results: SQLRow[];
  meta: { changes: number };
}
/** Executes all statements sequentially in one transaction, rolling back every statement on failure. */
export interface SqlDriver {
  batch(statements: SQLStatement[]): Promise<SQLResult[]>;
}
