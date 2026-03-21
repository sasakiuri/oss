// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { COMPETITION_ERRORS } from '@/shared/errors/catalogs/CompetitionErrors';
import { CONNECTION_ERRORS } from '@/shared/errors/catalogs/ConnectionErrors';
import { INFRA_ERRORS } from '@/shared/errors/catalogs/InfraErrors';
import { REPORT_ERRORS } from '@/shared/errors/catalogs/ReportErrors';
import { SESSION_ERRORS } from '@/shared/errors/catalogs/SessionErrors';
import { STORAGE_ERRORS } from '@/shared/errors/catalogs/StorageErrors';
import { TARGET_ERRORS } from '@/shared/errors/catalogs/TargetErrors';
import { DomainError } from '@/shared/errors/DomainError';
import { ErrorCatalog, type ErrorDefinition } from '@/shared/errors/ErrorCatalog';

type CatalogEntry<T extends string> = {
  name: string;
  errors: ReadonlyArray<[T, ErrorDefinition]>;
};

const ALL_CATALOGS: CatalogEntry<string>[] = [
  { name: 'SessionErrors', errors: SESSION_ERRORS },
  { name: 'ConnectionErrors', errors: CONNECTION_ERRORS },
  { name: 'StorageErrors', errors: STORAGE_ERRORS },
  { name: 'InfraErrors', errors: INFRA_ERRORS },
  { name: 'TargetErrors', errors: TARGET_ERRORS },
  { name: 'CompetitionErrors', errors: COMPETITION_ERRORS },
  { name: 'ReportErrors', errors: REPORT_ERRORS },
];

describe('error catalog consistency', () => {
  describe('error codes within each catalog are unique', () => {
    for (const catalog of ALL_CATALOGS) {
      it(`${catalog.name} has no duplicate error codes`, () => {
        const codes = catalog.errors.map(([code]) => code);
        const uniqueCodes = new Set(codes);
        expect(codes.length).toBe(uniqueCodes.size);
      });
    }
  });

  describe('error codes do not overlap across catalogs', () => {
    it('error codes are unique across all catalogs', () => {
      const allCodes: string[] = [];
      for (const catalog of ALL_CATALOGS) {
        for (const [code] of catalog.errors) {
          allCodes.push(code);
        }
      }
      const uniqueCodes = new Set(allCodes);
      expect(allCodes.length).toBe(uniqueCodes.size);
    });
  });

  describe('all catalog entries have the correct ErrorDefinition structure', () => {
    for (const catalog of ALL_CATALOGS) {
      it(`all entries in ${catalog.name} are valid ErrorDefinitions`, () => {
        for (const [key, def] of catalog.errors) {
          expect(def.code).toBe(key);
          expect(typeof def.message).toBe('string');
          expect(def.message.length).toBeGreaterThan(0);
          expect(typeof def.userMessage).toBe('string');
          expect(def.userMessage.length).toBeGreaterThan(0);
          expect(['error', 'warning', 'info']).toContain(def.severity);
        }
      });
    }
  });

  describe('all catalog entries produce valid DomainErrors via ErrorCatalog.createError()', () => {
    for (const catalog of ALL_CATALOGS) {
      it(`all entries in ${catalog.name} can create a DomainError`, () => {
        for (const [code] of catalog.errors) {
          const error = ErrorCatalog.createError(code as any);
          expect(error).toBeInstanceOf(DomainError);
          expect(error.code).toBe(code);
        }
      });
    }
  });

  it('all catalog errors are registered in ErrorCatalog', () => {
    for (const catalog of ALL_CATALOGS) {
      for (const [code] of catalog.errors) {
        const definition = ErrorCatalog.getErrorDefinition(code as any);
        expect(definition).toBeDefined();
        expect(definition?.code).toBe(code);
      }
    }
  });

  it('total error count across catalogs is correct', () => {
    const totalCount = ALL_CATALOGS.reduce((sum, catalog) => sum + catalog.errors.length, 0);
    // The total should equal the sum of each individual catalog's count
    expect(totalCount).toBe(
      SESSION_ERRORS.length +
        CONNECTION_ERRORS.length +
        STORAGE_ERRORS.length +
        INFRA_ERRORS.length +
        TARGET_ERRORS.length +
        COMPETITION_ERRORS.length +
        REPORT_ERRORS.length,
    );
    // Ensure a minimum number of errors are defined
    expect(totalCount).toBeGreaterThanOrEqual(40);
  });

  it('each catalog has at least one error defined', () => {
    for (const catalog of ALL_CATALOGS) {
      expect(catalog.errors.length).toBeGreaterThanOrEqual(1);
    }
  });
});
