// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { SessionStorageSchema, parseSessionStorageData } from '@/main/modules/session/infra/SessionStorageSchema';
import { DomainError } from '@/shared/errors/DomainError';

const validSessionData = {
  id: 'session-001',
  discipline: 'AIR_RIFLE_10M' as const,
  mode: 'MATCH' as const,
  series: [{ seriesNumber: 1, totalScore: 102.5 }],
  allShots: [
    {
      id: 'shot-001',
      shotNumber: 1,
      impactPoint: { x: 1.5, y: -2.3 },
      score: 9.8,
      innerTen: false,
      timestamp: '2026-01-15T10:00:00Z',
      seriesNumber: 1,
      mode: 'MATCH' as const,
    },
  ],
  startedAt: '2026-01-15T10:00:00Z',
  finishedAt: null,
};

describe('SessionStorageSchema', () => {
  it('should pass validation for valid session data', () => {
    const result = SessionStorageSchema.safeParse(validSessionData);
    expect(result.success).toBe(true);
  });

  it('should accept all discipline types', () => {
    const disciplines = [
      'AIR_RIFLE_10M',
      'AIR_PISTOL_10M',
      'RIFLE_50M',
      'PISTOL_25M',
      'BEAM_RIFLE_10M',
      'BEAM_PISTOL_10M',
    ];
    for (const discipline of disciplines) {
      const data = { ...validSessionData, discipline };
      const result = SessionStorageSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it('should reject an invalid discipline', () => {
    const data = { ...validSessionData, discipline: 'INVALID_DISCIPLINE' };
    const result = SessionStorageSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should fail when a required field is missing', () => {
    const { id: _id, ...missingId } = validSessionData;
    const result = SessionStorageSchema.safeParse(missingId);
    expect(result.success).toBe(false);
  });

  it('should fail for invalid shot data (negative shotNumber)', () => {
    const data = {
      ...validSessionData,
      allShots: [
        {
          ...validSessionData.allShots[0],
          shotNumber: -1,
        },
      ],
    };
    const result = SessionStorageSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should apply default value of 10 for series maxShots', () => {
    const data = {
      ...validSessionData,
      series: [{ seriesNumber: 1, totalScore: 100 }],
    };
    const result = SessionStorageSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.series[0]!.maxShots).toBe(10);
    }
  });

  it('should allow explicit specification of series maxShots', () => {
    const data = {
      ...validSessionData,
      series: [{ seriesNumber: 1, totalScore: 100, maxShots: 0 }],
    };
    const result = SessionStorageSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.series[0]!.maxShots).toBe(0);
    }
  });

  it('should accept null for finishedAt', () => {
    const data = { ...validSessionData, finishedAt: null };
    const result = SessionStorageSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.finishedAt).toBeNull();
    }
  });

  it('should accept a string for finishedAt', () => {
    const data = { ...validSessionData, finishedAt: '2026-01-15T11:00:00Z' };
    const result = SessionStorageSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should treat deviceScore as optional', () => {
    const withDeviceScore = {
      ...validSessionData,
      allShots: [{ ...validSessionData.allShots[0], deviceScore: 9.5 }],
    };
    const result = SessionStorageSchema.safeParse(withDeviceScore);
    expect(result.success).toBe(true);
  });
});

describe('parseSessionStorageData', () => {
  it('should validate and return valid data', () => {
    const result = parseSessionStorageData(validSessionData);
    expect(result.id).toBe('session-001');
    expect(result.discipline).toBe('AIR_RIFLE_10M');
  });

  it('should throw STORAGE_DATA_CORRUPTED error for invalid data', () => {
    try {
      parseSessionStorageData({ invalid: true });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('STORAGE_DATA_CORRUPTED');
    }
  });

  it('should include the problematic path in the error message', () => {
    try {
      parseSessionStorageData({ id: 123, discipline: 'BAD' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as DomainError).metadata).toBeDefined();
      expect((error as DomainError).metadata!.detail).toBeDefined();
    }
  });
});
