import { ISSF_2026_AR60_FINAL, ISSF_2026_R3P_FINAL, ISSF_2026_RFPM_FINAL } from '@sasakiuri/saika-rules';
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

  it('handles both 50m placings after shot 30 before advancing to shot 31', () => {
    const rifle50m = competitionTypeFromRulePack(ISSF_2026_R3P_FINAL);
    expect(policy.assess(rifle50m, { participantCount: 8, lanes: lanes(30), completedRanks: new Set() })).toMatchObject(
      { status: 'READY', afterShot: 30, expectedRank: 8 },
    );

    const afterEighth = lanes(30).map((lane, index) => ({ ...lane, finished: index === 0 }));
    expect(
      policy.assess(rifle50m, { participantCount: 8, lanes: afterEighth, completedRanks: new Set([8]) }),
    ).toMatchObject({ status: 'READY', afterShot: 30, expectedRank: 7 });

    const afterSeventh = lanes(30).map((lane, index) => ({ ...lane, finished: index < 2 }));
    expect(
      policy.assess(rifle50m, {
        participantCount: 8,
        lanes: afterSeventh,
        completedRanks: new Set([8, 7]),
      }),
    ).toMatchObject({ status: 'NOT_DUE', afterShot: 31, expectedRank: 6 });
  });

  it('orders exactly two tied 50m finalists by the configured standing-series countback', () => {
    const rifle50m = competitionTypeFromRulePack(ISSF_2026_R3P_FINAL);
    const tied = lanes(30, [3000, 3000, 3020, 3030, 3040, 3050, 3060, 3070]).map((lane, index) => ({
      ...lane,
      ...(index < 2
        ? {
            scoreBreakdown: [
              {
                stageIndex: 1,
                series: [
                  { seriesIndex: 0, shotsX10: Array(10).fill(100), seriesTotalX10: 1000 },
                  { seriesIndex: 1, shotsX10: Array(10).fill(100), seriesTotalX10: 1000 },
                ],
              },
              {
                stageIndex: 2,
                series: [
                  { seriesIndex: 0, shotsX10: Array(5).fill(100), seriesTotalX10: 500 },
                  {
                    seriesIndex: 1,
                    shotsX10: index === 0 ? [100, 100, 100, 100, 100] : [100, 100, 100, 100, 101],
                    seriesTotalX10: index === 0 ? 500 : 501,
                  },
                ],
              },
            ],
          }
        : {}),
    }));

    expect(policy.assess(rifle50m, { participantCount: 8, lanes: tied, completedRanks: new Set() })).toMatchObject({
      status: 'READY',
      expectedRank: 8,
      candidateLaneIds: ['11111111-1111-4111-8111-111111111111'],
      resolutionRequirement: 'COUNTBACK',
      ruleReference: 'ISSF 6.17.3',
    });
  });

  it('does not invent a 50m countback when detailed score evidence is missing', () => {
    const rifle50m = competitionTypeFromRulePack(ISSF_2026_R3P_FINAL);
    expect(
      policy.assess(rifle50m, {
        participantCount: 8,
        lanes: lanes(30, [3000, 3000, 3020, 3030, 3040, 3050, 3060, 3070]),
        completedRanks: new Set(),
      }),
    ).toMatchObject({ status: 'INCONSISTENT', expectedRank: 8, resolutionRequirement: null });
  });

  it('resolves Rapid Fire elimination ties by Finals Start Number through fifth place', () => {
    const rapidFire = competitionTypeFromRulePack(ISSF_2026_RFPM_FINAL);
    const tied = lanes(15, [80, 80, 90, 100, 110, 120, 130, 140]).map((lane, index) => ({
      ...lane,
      finalStartNumber: index + 1,
    }));

    expect(policy.assess(rapidFire, { participantCount: 8, lanes: tied, completedRanks: new Set() })).toMatchObject({
      status: 'READY',
      afterShot: 15,
      expectedRank: 8,
      candidateLaneIds: ['21111111-1111-4111-8111-111111111111'],
      resolutionRequirement: 'FINAL_START_NUMBER',
    });
  });

  it('blocks a Rapid Fire Start Number tie-break when required assignment evidence is missing', () => {
    const rapidFire = competitionTypeFromRulePack(ISSF_2026_RFPM_FINAL);

    expect(
      policy.assess(rapidFire, {
        participantCount: 8,
        lanes: lanes(15, [80, 80, 90, 100, 110, 120, 130, 140]),
        completedRanks: new Set(),
      }),
    ).toMatchObject({ status: 'INCONSISTENT', expectedRank: 8 });
  });
});
