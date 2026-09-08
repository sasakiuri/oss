// SPDX-License-Identifier: MIT
import { ISSF_2026_FP60_ELIMINATION } from '@sasakiuri/saika-rules';
import { describe, expect, it } from 'vitest';

import { OutdoorEliminationPolicy } from '@/main/modules/elimination-planning';

const policy = new OutdoorEliminationPolicy({
  venue: 'OUTDOOR',
  requiredWhenEntriesExceedUsableCapacity: true,
  waiverAuthority: 'TECHNICAL_DELEGATE',
  waiverReason: 'SCHEDULE_LIMITATIONS',
  completeCourseOfFire: true,
  randomSquadding: true,
  quotaMethod: 'PROPORTIONAL_RELAY_STARTS',
  balanceTeamsAndNationsAcrossRelays: true,
  minimumQualificationAthletes: 12,
  preferredDaysBeforeQualification: 1,
});

describe('OutdoorEliminationPolicy', () => {
  it('allocates a small 50m Pistol field without borrowing a Rifle minimum', () => {
    const pistolPolicy = new OutdoorEliminationPolicy(
      ISSF_2026_FP60_ELIMINATION.capabilities.outdoorEliminationPlanning!,
    );
    const plan = pistolPolicy.plan({ entryCount: 10, usableFiringPoints: 6, relayStartCounts: [6, 4] });
    expect(plan.qualificationPlaces).toBe(6);
    expect(plan.relayQuotas.map((relay) => relay.qualifyCount)).toEqual([4, 2]);
  });
  it('does not require Elimination when all entries fit the usable capacity', () => {
    expect(policy.plan({ entryCount: 60, usableFiringPoints: 60 })).toMatchObject({
      status: 'NOT_REQUIRED',
      eliminationRequired: false,
      minimumRelayCount: 1,
      qualificationPlaces: 60,
    });
  });

  it('requires a draw before producing relay quotas', () => {
    const plan = policy.plan({ entryCount: 101, usableFiringPoints: 60 });

    expect(plan).toMatchObject({ status: 'REQUIRED', eliminationRequired: true, minimumRelayCount: 2 });
    expect(plan.findings).toContainEqual(expect.objectContaining({ code: 'RELAY_START_COUNTS_REQUIRED' }));
  });

  it('reproduces the ISSF 60/101 proportional quota example', () => {
    const plan = policy.plan({ entryCount: 101, usableFiringPoints: 60, relayStartCounts: [54, 47] });

    expect(plan.status).toBe('PLANNED');
    expect(plan.relayQuotas).toEqual([
      { relayNumber: 1, startCount: 54, rawQuota: (60 / 101) * 54, qualifyCount: 32 },
      { relayNumber: 2, startCount: 47, rawQuota: (60 / 101) * 47, qualifyCount: 28 },
    ]);
    expect(plan.relayQuotas.reduce((sum, relay) => sum + relay.qualifyCount, 0)).toBe(60);
  });

  it('records only the narrow Technical Delegate schedule waiver', () => {
    expect(
      policy.plan({
        entryCount: 61,
        usableFiringPoints: 60,
        waiver: {
          authorityRole: 'TECHNICAL_DELEGATE',
          officialName: 'TD A',
          reason: 'SCHEDULE_LIMITATIONS',
          statement: 'Venue schedule cannot accommodate an Elimination day.',
        },
      }),
    ).toMatchObject({ status: 'WAIVED', waiver: { officialName: 'TD A' } });
  });

  it('rejects impossible venue geometry and inconsistent relay counts', () => {
    expect(() => policy.plan({ entryCount: 20, usableFiringPoints: 11 })).toThrow('required minimum');
    expect(() => policy.plan({ entryCount: 101, usableFiringPoints: 60, relayStartCounts: [60, 40] })).toThrow(
      'equal the entry count',
    );
  });
});
