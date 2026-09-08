/**
 * MigrationRunner unit tests
 *
 * Note: These tests use better-sqlite3 directly but the native module is compiled
 * for Electron (via electron-rebuild), not Node.js. Therefore these tests are
 * integration tests that can only run in the Electron environment.
 *
 * The MigrationRunner logic is implicitly tested by any test that uses DatabaseManager
 * or by running the app itself.
 */
import type Database from 'better-sqlite3';
import { describe, it, expect, vi } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import type { Migration } from '@/main/infrastructure/database/migrations/Migration';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';

describe('MigrationRunner', () => {
  describe('allMigrations', () => {
    it('should have migrations sorted by version', () => {
      const sorted = [...allMigrations].sort((a, b) => a.version - b.version);
      expect(allMigrations.map((m) => m.version)).toEqual(sorted.map((m) => m.version));
    });

    it('should have unique version numbers', () => {
      const versions = allMigrations.map((m) => m.version);
      expect(new Set(versions).size).toBe(versions.length);
    });

    it('should have non-empty names', () => {
      for (const migration of allMigrations) {
        expect(migration.name).toBeTruthy();
      }
    });

    it('registers per-competition start policy settings after the firing ledger', () => {
      const maxVersion = Math.max(...allMigrations.map((m) => m.version));
      expect(maxVersion).toBe(75);
      expect(allMigrations.find((migration) => migration.version === 73)?.name).toBe('est_inspection_start_settings');
      expect(allMigrations.find((migration) => migration.version === 72)?.name).toBe('relay_readiness_start_settings');
    });
  });

  describe('Migration interface', () => {
    it('should accept a valid migration', () => {
      const migration: Migration = {
        version: 99,
        name: 'test_migration',
        up: () => {},
      };
      expect(migration.version).toBe(99);
      expect(migration.name).toBe('test_migration');
    });
  });

  describe('MigrationRunner class', () => {
    it('should be constructable', () => {
      // We can't actually instantiate with a real DB in jsdom environment
      // but we can verify the class exists and is exported
      expect(MigrationRunner).toBeDefined();
    });

    it('rolls back the legacy reset when a replacement migration fails', () => {
      let state = { version: 2, legacyTableExists: true };
      const db = {
        exec: vi.fn((sql: string) => {
          if (sql.includes('DROP TABLE')) state.legacyTableExists = false;
        }),
        prepare: vi.fn((sql: string) => {
          if (sql.includes('SELECT value')) {
            return { get: () => ({ value: String(state.version) }) };
          }
          return {
            run: (version: string) => {
              state.version = Number(version);
            },
          };
        }),
        transaction: vi.fn((work: () => void) => () => {
          const before = { ...state };
          try {
            work();
          } catch (error) {
            state = before;
            throw error;
          }
        }),
      } as unknown as Database.Database;
      const runner = new MigrationRunner(db);
      const migrationFailure = new Error('replacement migration failed');

      expect(() =>
        runner.run([
          {
            version: 3,
            name: 'replacement_schema',
            up: () => {
              throw migrationFailure;
            },
          },
        ]),
      ).toThrow(migrationFailure);

      expect(state).toEqual({ version: 2, legacyTableExists: true });
    });

    it('rejects malformed schema version metadata', () => {
      const db = {
        exec: vi.fn(),
        prepare: vi.fn(() => ({ get: () => ({ value: '6-corrupt' }) })),
      } as unknown as Database.Database;

      expect(() => new MigrationRunner(db).getCurrentVersion()).toThrow('Invalid database schema version');
    });

    it('rejects a database created by a newer schema version', () => {
      const db = {
        exec: vi.fn(),
        prepare: vi.fn(() => ({ get: () => ({ value: '8' }) })),
        transaction: vi.fn(),
      } as unknown as Database.Database;
      const migration: Migration = {
        version: 7,
        name: 'latest_supported_schema',
        up: vi.fn(),
      };

      expect(() => new MigrationRunner(db).run([migration])).toThrow('newer than the latest supported version 7');
      expect(db.transaction).not.toHaveBeenCalled();
    });
  });
});
