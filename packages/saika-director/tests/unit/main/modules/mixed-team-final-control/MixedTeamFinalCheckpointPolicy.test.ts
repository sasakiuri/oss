import { ISSF_2026_ARMIX_FINAL } from '@sasakiuri/saika-rules';
import { describe, expect, it } from 'vitest';
import { MixedTeamFinalCheckpointPolicy } from '@/main/modules/mixed-team-final-control/domain/MixedTeamFinalCheckpointPolicy';
import { competitionTypeFromRulePack } from '@/shared/competitionTypes';
import type { MixedTeamFinalSnapshotDto } from '@/shared/ipc/contracts';

const policy = new MixedTeamFinalCheckpointPolicy();
const definition = competitionTypeFromRulePack(ISSF_2026_ARMIX_FINAL);

function teams(shotCount: number, totals = [1800, 1820, 1840, 1860]): MixedTeamFinalSnapshotDto[] {
  return totals.map((total, teamIndex) => ({
    teamId: `team-${teamIndex + 1}`,
    teamName: `Team ${teamIndex + 1}`,
    nationCode: ['USA', 'JPN', 'GER', 'FRA'][teamIndex]!,
    members: (['F', 'M'] as const).map((gender, memberIndex) => ({
      laneId: `${teamIndex + 1}${memberIndex + 1}111111-1111-4111-8111-111111111111`,
      participantId: `participant-${teamIndex}-${memberIndex}`,
      athleteName: `Athlete ${teamIndex}-${memberIndex}`,
      gender,
      totalShotCount: shotCount,
      totalScoreX10: Math.floor(total / 2) + memberIndex,
      finished: false,
    })),
  }));
}

describe('MixedTeamFinalCheckpointPolicy', () => {
  it('uses combined team totals at shots 18, 21 and 24', () => {
    expect(policy.assess(definition, { teams: teams(17), completedRanks: new Set() })).toMatchObject({
      status: 'NOT_DUE',
      afterShot: 18,
      expectedRank: 4,
    });
    expect(policy.assess(definition, { teams: teams(18), completedRanks: new Set() })).toMatchObject({
      status: 'READY',
      afterShot: 18,
      expectedRank: 4,
      candidateTeamIds: ['team-1'],
    });

    const afterFourth = teams(21).map((team, index) => ({
      ...team,
      members: team.members.map((member) => ({ ...member, finished: index === 0 })),
    }));
    expect(policy.assess(definition, { teams: afterFourth, completedRanks: new Set([4]) })).toMatchObject({
      status: 'READY',
      afterShot: 21,
      expectedRank: 3,
      candidateTeamIds: ['team-2'],
    });
  });

  it('requires tie resolution and rejects bypassed checkpoints', () => {
    expect(
      policy.assess(definition, { teams: teams(18, [1800, 1800, 1840, 1860]), completedRanks: new Set() }),
    ).toMatchObject({ status: 'TIE', candidateTeamIds: ['team-1', 'team-2'] });
    expect(policy.assess(definition, { teams: teams(19), completedRanks: new Set() })).toMatchObject({
      status: 'INCONSISTENT',
      afterShot: 18,
      expectedRank: 4,
    });
  });
});
