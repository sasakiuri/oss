import { describe, expect, it } from 'vitest';

import {
  LaneTimingEvidencePolicy,
  type LaneTimingEvidenceFacts,
} from '@/main/modules/mqtt/domain/LaneTimingEvidencePolicy';

const now = new Date('2026-09-09T00:00:00Z');
const settings = { mode: 'BOUNDED' as const, maximumReceiptDelayMilliseconds: 100, clockUncertaintyMilliseconds: 10 };
const connection = { manufacturer: 'KOHTO', deviceId: 'MT201', portPath: 'COM1' };
const ready: LaneTimingEvidenceFacts = {
  connected: true,
  reportedAt: now.toISOString(),
  connection,
  settings,
  evidence: {
    state: 'VERIFIED',
    profileId: '11111111-1111-4111-8111-111111111111',
    measuredAt: '2026-09-08T00:00:00Z',
    validUntil: '2026-09-10T00:00:00Z',
    installationRevision: '22222222-2222-4222-8222-222222222222',
    measurementSha256: 'a'.repeat(64),
    connection,
    settings,
    issues: [],
  },
};

describe('Lane timing evidence start policy', () => {
  it('keeps manual operation available while supporting independent advisory and required checks', () => {
    let mode: 'DISABLED' | 'ADVISORY' | 'REQUIRED' = 'DISABLED';
    const policy = new LaneTimingEvidencePolicy(() => mode);
    expect(policy.assess('lane', { connected: false }, now)).toEqual([]);
    mode = 'ADVISORY';
    expect(policy.assess('lane', { ...ready, evidence: undefined }, now)).toEqual([
      expect.objectContaining({ blocking: false, code: 'LANE_TIMING_EVIDENCE' }),
    ]);
    mode = 'REQUIRED';
    expect(policy.assess('lane', ready, now)).toEqual([]);
    expect(policy.assess('lane', { ...ready, evidence: undefined }, now)[0]?.blocking).toBe(true);
  });

  it('matches a serial installation when neither side provides a device ID', () => {
    const policy = new LaneTimingEvidencePolicy(() => 'REQUIRED');
    expect(
      policy.assess(
        'lane',
        {
          ...ready,
          connection: { ...connection, deviceId: null },
          evidence: { ...ready.evidence!, connection: { ...connection, deviceId: '' } },
        },
        now,
      ),
    ).toEqual([]);
  });

  it.each([
    { connection: { ...connection, portPath: 'COM2' } },
    { settings: { ...settings, clockUncertaintyMilliseconds: 0 } },
    { evidence: { ...ready.evidence!, validUntil: now.toISOString() } },
    { evidence: { ...ready.evidence!, installationRevision: null } },
    { evidence: { ...ready.evidence!, measuredAt: 'invalid' } },
    { evidence: { ...ready.evidence!, validUntil: 'invalid' } },
    { evidence: { ...ready.evidence!, state: 'INVALID' as const } },
    { reportedAt: '2026-09-08T23:57:29Z' },
    { connected: false },
  ])('rejects stale evidence, changed hardware/bounds and missing provenance (%j)', (change) => {
    const issues = new LaneTimingEvidencePolicy(() => 'REQUIRED').assess('lane', { ...ready, ...change }, now);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.blocking)).toBe(true);
  });
});
