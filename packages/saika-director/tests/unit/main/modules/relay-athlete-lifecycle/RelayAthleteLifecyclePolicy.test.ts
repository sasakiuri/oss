import { describe, expect, it } from 'vitest';

import {
  athleteMayBeReleased,
  IssfRelayAthleteLifecyclePolicy,
  RelayAthleteLifecycleEntry,
  type RelayAthleteLifecycleAssessmentItem,
} from '@/main/modules/relay-athlete-lifecycle';

const athlete = {
  laneId: 'lane-a',
  athleteId: 'athlete-a',
  athleteName: 'Athlete A',
  athleteStartNumber: 12,
};

function confirm(item: RelayAthleteLifecycleAssessmentItem): RelayAthleteLifecycleEntry {
  return RelayAthleteLifecycleEntry.create({
    competitionId: 'competition-a',
    relayNumber: 1,
    ...athlete,
    phase: item.phase,
    requirement: item.requirement,
    state: 'CONFIRMED',
    source: 'MANUAL',
    statement: 'Checked',
    officialName: 'RO A',
  });
}

describe('IssfRelayAthleteLifecyclePolicy', () => {
  it('keeps pre-relay identity and equipment approval as independent required evidence', () => {
    const policy = new IssfRelayAthleteLifecyclePolicy('REQUIRED');
    const pending = policy.assess({ phase: 'PRE_RELAY', athletes: [athlete], entries: [] });

    expect(pending.items.map((item) => item.requirement)).toEqual([
      'ATHLETE_IDENTITY_BIB_VERIFIED',
      'EQUIPMENT_APPROVAL_VERIFIED',
    ]);
    expect(pending).toMatchObject({ ready: false, mayProceed: false });

    const complete = policy.assess({
      phase: 'PRE_RELAY',
      athletes: [athlete],
      entries: pending.items.map(confirm),
    });
    expect(complete).toMatchObject({ ready: true, mayProceed: true });
  });

  it('accepts athlete signature or official initials only after firearm clearance for release eligibility', () => {
    const policy = new IssfRelayAthleteLifecyclePolicy('REQUIRED');
    const pending = policy.assess({ phase: 'POST_RELAY', athletes: [athlete], entries: [] });
    const firearm = pending.items.find((item) => item.requirement === 'FIREARM_UNLOADED_SAFETY_FLAG_VERIFIED')!;
    const initials = pending.items.find((item) => item.requirement === 'PRINTOUT_OFFICIAL_INITIALLED')!;
    const release = pending.items.find((item) => item.requirement === 'ATHLETE_RELEASED')!;

    const eligible = policy.assess({
      phase: 'POST_RELAY',
      athletes: [athlete],
      entries: [confirm(firearm), confirm(initials)],
    });
    expect(athleteMayBeReleased(eligible.items, athlete.athleteId)).toBe(true);
    expect(eligible.ready).toBe(false);

    const complete = policy.assess({
      phase: 'POST_RELAY',
      athletes: [athlete],
      entries: [confirm(firearm), confirm(initials), confirm(release)],
    });
    expect(complete).toMatchObject({ ready: true, mayProceed: true });
  });

  it('does not reuse evidence after an athlete is replaced on the same Lane', () => {
    const policy = new IssfRelayAthleteLifecyclePolicy('ADVISORY');
    const pending = policy.assess({ phase: 'PRE_RELAY', athletes: [athlete], entries: [] });
    const entries = pending.items.map(confirm);
    const replacement = { ...athlete, athleteId: 'athlete-b', athleteName: 'Athlete B' };

    expect(policy.assess({ phase: 'PRE_RELAY', athletes: [replacement], entries }).ready).toBe(false);
  });
});
