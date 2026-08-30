import { ISSF_2026_AR60_FINAL } from '@sasakiuri/saika-rules';
import { describe, expect, it } from 'vitest';
import { FinalCheckpointPolicy } from '@/main/modules/final-control';
import { competitionTypeFromRulePack } from '@/shared/competitionTypes';
import type { FinalControlLaneSnapshotDto } from '@/shared/ipc/contracts';

const definition = competitionTypeFromRulePack(ISSF_2026_AR60_FINAL);
const policy = new FinalCheckpointPolicy();

function lanes(
  shotCount: number,
  scores = [1010, 1020, 1030, 1040, 1050, 1060, 1070, 1080],
): FinalControlLaneSnapshotDto[] {
  return scores.map((totalScoreX10, index) => ({
    laneId: `${index + 1}1111111-1111-4111-8111-111111111111`,
    athleteName: `Athlete ${index + 1}`,
    totalShotCount: shotCount,
    totalScoreX10,
    finished: false,
  }));
}

describe('FinalCheckpointPolicy', () => {
  it('waits until shot 12 and identifies the clear rank-eight candidate', () => {
    expect(
      policy.assess(definition, { participantCount: 8, lanes: lanes(11), completedRanks: new Set() }),
    ).toMatchObject({ status: 'NOT_DUE', afterShot: 12, expectedRank: 8 });

    expect(
      policy.assess(definition, { participantCount: 8, lanes: lanes(12), completedRanks: new Set() }),
    ).toMatchObject({
      status: 'READY',
      afterShot: 12,
      expectedRank: 8,
      candidateLaneIds: ['11111111-1111-4111-8111-111111111111'],
    });
  });

  it('requires an explicit tie resolution and advances every two single shots', () => {
    expect(
      policy.assess(definition, {
        participantCount: 8,
        lanes: lanes(12, [1010, 1010, 1030, 1040, 1050, 1060, 1070, 1080]),
        completedRanks: new Set(),
      }),
    ).toMatchObject({
      status: 'TIE',
      candidateLaneIds: expect.arrayContaining([
        '11111111-1111-4111-8111-111111111111',
        '21111111-1111-4111-8111-111111111111',
      ]),
    });

    const snapshots = lanes(16).map((lane, index) => ({ ...lane, finished: index < 2 }));
    expect(
      policy.assess(definition, {
        participantCount: 8,
        lanes: snapshots,
        completedRanks: new Set([8, 7]),
      }),
    ).toMatchObject({ status: 'READY', afterShot: 16, expectedRank: 6 });
  });

  it('does not silently skip a checkpoint', () => {
    expect(
      policy.assess(definition, {
        participantCount: 8,
        lanes: lanes(13),
        completedRanks: new Set(),
      }),
    ).toMatchObject({ status: 'INCONSISTENT', afterShot: 12, expectedRank: 8 });
  });
});
