// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { QualificationMalfunctionSignalPayloadSchema } from '@/shared/mqtt/QualificationMalfunctionSignal';

const emptyState = {
  schemaVersion: 1,
  laneId: '11111111-1111-4111-8111-111111111111',
  status: 'CLEARED',
  signalId: null,
  context: null,
  message: null,
  signalledAt: null,
  clearedAt: null,
  clearedBy: null,
  publishedAt: '2026-09-04T00:00:00.000Z',
} as const;

describe('QualificationMalfunctionSignalPayloadSchema', () => {
  it('accepts the initial empty retained state', () => {
    expect(QualificationMalfunctionSignalPayloadSchema.parse(emptyState)).toEqual(emptyState);
  });

  it('rejects active state without an immutable context snapshot', () => {
    expect(
      QualificationMalfunctionSignalPayloadSchema.safeParse({
        ...emptyState,
        status: 'ACTIVE',
        signalId: '22222222-2222-4222-8222-222222222222',
        signalledAt: '2026-09-04T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});
