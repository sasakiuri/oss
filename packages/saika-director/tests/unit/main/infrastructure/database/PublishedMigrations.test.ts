// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';

import { latestMigrationVersion, migratedDatabase } from '../../../../helpers/database';

interface PublishedMigration {
  version: number;
  name: string;
  file: string;
  sha256: string;
}

const migrationDirectory = fileURLToPath(
  new URL('../../../../../src/main/infrastructure/database/migrations/', import.meta.url),
);
const published = JSON.parse(
  readFileSync(new URL('./published-migrations.json', import.meta.url), 'utf8'),
) as PublishedMigration[];

/** Module specifiers of static, side-effect and re-export statements, dynamic imports and require calls. */
function importedModules(source: string): string[] {
  return [
    ...source.matchAll(/^\s*(?:import|export)\b[^;'"`]*?\bfrom\s*['"]([^'"]+)['"]/gm),
    ...source.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
    ...source.matchAll(/\b(?:import|require)\s*\(\s*['"`]([^'"`]+)['"`]/g),
  ].map((match) => match[1]!);
}

describe('published migrations', () => {
  it('keeps every published migration source byte-identical', () => {
    for (const migration of published) {
      const sha256 = createHash('sha256')
        .update(readFileSync(`${migrationDirectory}${migration.file}`))
        .digest('hex');
      expect(sha256, `${migration.file} is published; add a new migration instead of editing it`).toBe(
        migration.sha256,
      );
    }
  });

  it('registers exactly the listed migrations, in order, one file each', () => {
    expect(allMigrations.map(({ version, name }) => ({ version, name }))).toEqual(
      published.map(({ version, name }) => ({ version, name })),
    );
    expect(
      readdirSync(migrationDirectory)
        .filter((file) => /^\d{3}_.+\.ts$/.test(file))
        .sort(),
    ).toEqual(published.map(({ file }) => file));
    for (const { version, file } of published) expect(file.startsWith(String(version).padStart(3, '0'))).toBe(true);
  });

  it('finds every form of module reference', () => {
    const source = [
      "import { a } from './a';",
      'import type {',
      '  B,',
      "} from '../b';",
      "import '../c';",
      "export { d } from '../d';",
      "export * from '../e';",
      "const f = await import('../f');",
      "const g = require('../g');",
      'const sql = `SELECT id from events`;',
    ].join('\n');
    expect(importedModules(source).sort()).toEqual(['../b', '../c', '../d', '../e', '../f', '../g', './a']);
  });

  it('keeps migrations independent of current feature code', () => {
    for (const { file } of published) {
      const source = readFileSync(`${migrationDirectory}${file}`, 'utf8');
      expect(
        importedModules(source).filter((specifier) => !/^(\.\/Migration|node:.+|zod|better-sqlite3)$/.test(specifier)),
        `${file} must not import application or protocol code`,
      ).toEqual([]);
    }
  });

  it('creates the pinned schema on an empty database', async () => {
    const database = migratedDatabase();
    try {
      const version = database.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
        value: string;
      };
      expect(version.value).toBe(String(latestMigrationVersion));
      const objects = database
        .prepare('SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type, name')
        .all() as { sql: string }[];
      await expect(`${objects.map(({ sql }) => `${sql};`).join('\n\n')}\n`).toMatchFileSnapshot(
        './migrated-schema.txt',
      );
    } finally {
      database.close();
    }
  });
});
