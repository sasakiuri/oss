import { ISSF_2026_ARMIX_FINAL } from '@sasakiuri/saika-rules';
import { describe, expect, it, vi } from 'vitest';

import { PublishMqttMixedTeamFinalResultsHandler } from '@/main/modules/results/commands/PublishMqttMixedTeamFinalResultsHandler';
import type { IMixedTeamFinalResultRepository, MixedTeamFinalResultRecord } from '@/main/modules/team-results';
import { CompetitionTypeRegistry, competitionTypeFromRulePack } from '@/shared/competitionTypes';
import type { MixedTeamFinalDecisionDto } from '@/shared/ipc/contracts';
import type { PublishMqttResultLane } from '@/main/modules/results';

const competitionId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';

class MemoryRepository implements IMixedTeamFinalResultRepository {
  results: MixedTeamFinalResultRecord[] = [];
  replaceByEvent(_eventId: string, results: readonly MixedTeamFinalResultRecord[]): void {
    this.results = [...results];
  }
  findByEvent(): MixedTeamFinalResultRecord[] {
    return this.results;
  }
}

function lane(teamIndex: number, memberIndex: number, shotCount: number): PublishMqttResultLane {
  const laneId = `${teamIndex}${memberIndex}111111-1111-4111-8111-111111111111`;
  const participantId = `participant-${teamIndex}-${memberIndex}`;
  const shots = Array.from({ length: shotCount }, () => 100 + teamIndex);
  const first = shots.slice(0, 15);
  const second = shots.slice(15);
  return {
    laneId,
    assignment: {
      competitionId,
      laneId,
      athlete: {
        id: participantId,
        startNumber: teamIndex * 10 + memberIndex,
        name: `Athlete ${teamIndex}-${memberIndex}`,
        teamId: `team-${teamIndex}`,
        teamName: `Team ${teamIndex}`,
        nationCode: ['USA', 'JPN', 'GER', 'FRA'][teamIndex - 1]!,
        gender: memberIndex === 1 ? 'F' : 'M',
      },
      assignedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
    },
    score: {
      competitionId,
      laneId,
      sessionId: `${teamIndex}${memberIndex}222222-2222-4222-8222-222222222222`,
      totalScoreX10: shots.reduce((sum, shot) => sum + shot, 0),
      totalShotCount: shotCount,
      acc: 'DECIMAL',
      stages: [
        {
          stageIndex: 1,
          stageName: 'First',
          stageTotalX10: first.reduce((sum, shot) => sum + shot, 0),
          series: [
            {
              seriesIndex: 0,
              shots: first,
              seriesTotalX10: first.reduce((sum, shot) => sum + shot, 0),
              isComplete: true,
            },
          ],
        },
        {
          stageIndex: 2,
          stageName: 'Singles',
          stageTotalX10: second.reduce((sum, shot) => sum + shot, 0),
          series: [
            {
              seriesIndex: 0,
              shots: second,
              seriesTotalX10: second.reduce((sum, shot) => sum + shot, 0),
              isComplete: true,
            },
          ],
        },
      ],
      publishedAt: new Date().toISOString(),
    },
    shots: [],
  };
}

function decision(rank: 2 | 3 | 4, teamIndex: number, afterShot: number): MixedTeamFinalDecisionDto {
  const memberLaneIds = ([1, 2] as const).map(
    (memberIndex) => `${teamIndex}${memberIndex}111111-1111-4111-8111-111111111111`,
  ) as [string, string];
  return {
    id: `${rank}3333333-3333-4333-8333-333333333333`,
    competitionId,
    eventId,
    competitionTypeId: 'ARMIX_FINAL',
    afterShot,
    rank,
    selectedTeamId: `team-${teamIndex}`,
    memberLaneIds,
    scoreSnapshot: [],
    tiedTeamIds: [],
    resolution: 'CLEAR_LOWEST',
    resolutionStatement: null,
    officialName: 'Jury',
    ruleReference: 'ISSF 6.18.3.6',
    recordedAt: new Date().toISOString(),
    voided: false,
    commandCompleted: true,
    latestLaneStatuses: Object.fromEntries(memberLaneIds.map((laneId) => [laneId, 'DONE'])) as Record<string, 'DONE'>,
    commandAttempts: [],
  };
}

describe('PublishMqttMixedTeamFinalResultsHandler', () => {
  it('combines two Lane snapshots per team and takes ranks only from completed decisions', async () => {
    const shotCounts = new Map([
      [1, 24],
      [2, 24],
      [3, 21],
      [4, 18],
    ]);
    const lanes = [1, 2, 3, 4].flatMap((teamIndex) =>
      [1, 2].map((memberIndex) => lane(teamIndex, memberIndex, shotCounts.get(teamIndex)!)),
    );
    const assignments = lanes.map((item, index) => ({
      firingPointNumber: index + 1,
      participantId: item.assignment!.athlete!.id,
      playerName: item.assignment!.athlete!.name,
      familyName: item.assignment!.athlete!.name,
      affiliation: item.assignment!.athlete!.nationCode!,
    }));
    const queryBus = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          id: eventId,
          name: 'Mixed Final',
          eventType: 'ARMIX_FINAL',
          round: 'Final',
          sortOrder: 0,
        })
        .mockResolvedValueOnce(assignments),
    };
    const repository = new MemoryRepository();
    const registry = new CompetitionTypeRegistry();
    registry.register(competitionTypeFromRulePack(ISSF_2026_ARMIX_FINAL));
    const control = {
      findByCompetition: () => [decision(4, 4, 18), decision(3, 3, 21), decision(2, 2, 24)],
    };
    const handler = new PublishMqttMixedTeamFinalResultsHandler(
      queryBus as never,
      repository,
      registry,
      control as never,
    );

    await expect(
      handler.execute({ competitionId, competitionTypeId: 'ARMIX_FINAL', eventId, relayNumber: 1, lanes }),
    ).resolves.toEqual({ savedCount: 4, errors: [] });
    expect(repository.results.map((result) => [result.teamId, result.finalRank, result.eliminatedAtShot])).toEqual(
      expect.arrayContaining([
        ['team-1', 1, null],
        ['team-2', 2, 24],
        ['team-3', 3, 21],
        ['team-4', 4, 18],
      ]),
    );
    expect(repository.results.every((result) => result.members[0]?.gender === 'F')).toBe(true);
    expect(
      repository.results
        .find((result) => result.teamId === 'team-4')
        ?.members.every((member) => member.stage1Shots.length === 15 && member.stage2Shots.length === 3),
    ).toBe(true);
  });
});
