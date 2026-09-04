// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { EstComplaintSignalPayloadSchema } from '@/shared/mqtt/EstComplaintSignal';

describe('EstComplaintSignalPayloadSchema', () => {
  it('accepts an empty retained cleared state', () => {
    expect(
      EstComplaintSignalPayloadSchema.parse({
        schemaVersion: 1,
        laneId: '11111111-1111-4111-8111-111111111111',
        status: 'CLEARED',
        signalId: null,
        issue: null,
        context: null,
        message: null,
        signalledAt: null,
        clearedAt: null,
        clearedBy: null,
        publishedAt: '2026-09-04T00:00:00.000Z',
      }).status,
    ).toBe('CLEARED');
  });

  it('rejects an active state without an issue or context', () => {
    expect(
      EstComplaintSignalPayloadSchema.safeParse({
        schemaVersion: 1,
        laneId: '11111111-1111-4111-8111-111111111111',
        status: 'ACTIVE',
        signalId: '22222222-2222-4222-8222-222222222222',
        issue: null,
        context: null,
        message: null,
        signalledAt: '2026-09-04T00:00:00.000Z',
        clearedAt: null,
        clearedBy: null,
        publishedAt: '2026-09-04T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});
