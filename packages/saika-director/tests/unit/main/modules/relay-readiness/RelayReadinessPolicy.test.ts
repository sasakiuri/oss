import { describe, expect, it } from 'vitest';

import {
  IssfRelayReadinessPolicy,
  RelayReadinessEntry,
  type IRelayReadinessChecklist,
  type RelayReadinessAssessmentItem,
} from '@/main/modules/relay-readiness';

const COMPETITION_ID = 'competition-1';
const LANE_A = 'lane-a';
const LANE_B = 'lane-b';

function confirmation(item: RelayReadinessAssessmentItem): RelayReadinessEntry {
  return RelayReadinessEntry.create({
    competitionId: COMPETITION_ID,
    relayNumber: 1,
    laneId: item.laneId,
    phase: item.phase,
    requirement: item.requirement,
    state: 'CONFIRMED',
    source: 'MANUAL',
    statement: 'Inspected by the Jury Member',
    officialName: 'Jury A',
  });
}

describe('IssfRelayReadinessPolicy', () => {
  it('expands every ISSF 6.10.3.2 inspection for every Lane and keeps relay checks phase-independent', () => {
    const policy = new IssfRelayReadinessPolicy('ADVISORY');
    const sighting = policy.assess({ phase: 'SIGHTING', laneIds: [LANE_A, LANE_B, LANE_A], entries: [] });

    expect(sighting.items).toHaveLength(11);
    expect(sighting.items.filter((item) => item.phase === 'RELAY')).toHaveLength(9);
    expect(sighting.items.filter((item) => item.requirement === 'TARGET_MODE_CONFIRMED')).toEqual([
      expect.objectContaining({ laneId: LANE_A, phase: 'SIGHTING', ruleReference: 'ISSF 6.10.4(b)' }),
      expect.objectContaining({ laneId: LANE_B, phase: 'SIGHTING', ruleReference: 'ISSF 6.10.4(b)' }),
    ]);
    for (const requirement of [
      'TARGET_WHITE_SURFACE_CLEAR',
      'TARGET_FRAME_MARKS_INDICATED',
      'CONTROL_SHEET_RENEWED',
      'BACKING_MATERIAL_CLEAR',
    ]) {
      expect(sighting.items.filter((item) => item.requirement === requirement)).toHaveLength(2);
    }

    const sightingEntries = sighting.items.map(confirmation);
    expect(policy.assess({ phase: 'SIGHTING', laneIds: [LANE_A, LANE_B], entries: sightingEntries }).ready).toBe(true);

    const match = policy.assess({ phase: 'MATCH', laneIds: [LANE_A, LANE_B], entries: sightingEntries });
    expect(match.items.filter((item) => item.phase === 'RELAY').every((item) => item.confirmed)).toBe(true);
    expect(match.items.filter((item) => item.phase === 'MATCH').every((item) => !item.confirmed)).toBe(true);
    expect(match.ready).toBe(false);
  });

  it('requires renewed confirmation after the target changes to the other mode', () => {
    const policy = new IssfRelayReadinessPolicy('REQUIRED');
    const sighting = policy.assess({ phase: 'SIGHTING', laneIds: [LANE_A], entries: [] });
    const entries = sighting.items.map(confirmation);
    const matchItem = policy
      .assess({ phase: 'MATCH', laneIds: [LANE_A], entries })
      .items.find((item) => item.requirement === 'TARGET_MODE_CONFIRMED')!;
    entries.push(confirmation(matchItem));
    expect(policy.assess({ phase: 'MATCH', laneIds: [LANE_A], entries }).mayStart).toBe(true);
    expect(policy.assess({ phase: 'SIGHTING', laneIds: [LANE_A], entries }).mayStart).toBe(false);
    entries.push(confirmation(sighting.items.find((item) => item.requirement === 'TARGET_MODE_CONFIRMED')!));
    expect(policy.assess({ phase: 'SIGHTING', laneIds: [LANE_A], entries }).mayStart).toBe(true);
    expect(policy.assess({ phase: 'MATCH', laneIds: [LANE_A], entries }).mayStart).toBe(false);
  });

  it('supports a replaceable checklist with non-blocking local checks', () => {
    const localChecklist: IRelayReadinessChecklist = {
      definitions: () => [
        {
          requirement: 'TARGET_MODE_CONFIRMED',
          phase: 'CURRENT',
          scope: 'LANE',
          label: 'Target mode',
          ruleReference: 'Local rule',
          required: false,
        },
      ],
    };

    const assessment = new IssfRelayReadinessPolicy('REQUIRED', localChecklist).assess({
      phase: 'MATCH',
      laneIds: [LANE_A],
      entries: [],
    });

    expect(assessment).toMatchObject({ ready: true, mayStart: true });
    expect(assessment.items[0]).toMatchObject({ required: false, confirmed: false });
  });

  it('rejects a relay inspection recorded against an operational phase', () => {
    expect(() =>
      RelayReadinessEntry.create({
        competitionId: COMPETITION_ID,
        relayNumber: 1,
        laneId: LANE_A,
        phase: 'MATCH',
        requirement: 'CONTROL_SHEET_RENEWED',
        state: 'CONFIRMED',
        source: 'MANUAL',
        statement: 'Checked',
        officialName: 'Jury A',
      }),
    ).toThrow('must use the RELAY phase');
  });
});
