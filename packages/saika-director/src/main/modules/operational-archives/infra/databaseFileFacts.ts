// SPDX-License-Identifier: MIT
import type BetterSqlite3 from 'better-sqlite3';

// Backup inspection and startup restore read these facts; each caller decides what they mean and how to report
// them, and the restore check stops at a failed integrity check before reading the schema.

/** True when SQLite's integrity check reports exactly `ok`. */
export function passesIntegrityCheck(database: BetterSqlite3.Database): boolean {
  const rows = database.pragma('integrity_check') as Array<Record<string, unknown>>;
  return rows.length === 1 && Object.values(rows[0] ?? {})[0] === 'ok';
}

/** The stored `schema_meta` version text, or undefined when the row is missing. */
export function readSchemaVersionValue(database: BetterSqlite3.Database): string | undefined {
  const row = database.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as
    { value: string } | undefined;
  return row?.value;
}
