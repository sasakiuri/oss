// SPDX-License-Identifier: MIT
import { readFileSync, readdirSync } from "node:fs";

const directory = new URL("../../migrations/", import.meta.url);
/** Every D1 migration in the order Wrangler applies them. */
export const MIGRATION_FILES = readdirSync(directory)
  .filter((name) => name.endsWith(".sql"))
  .sort();
export function migration(name: string): string {
  return readFileSync(new URL(name, directory), "utf8");
}
/** Statement boundaries used by the existing Miniflare and benchmark harnesses. */
export function migrationStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}
