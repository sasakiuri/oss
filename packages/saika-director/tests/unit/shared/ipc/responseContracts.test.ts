import { describe, expect, it } from 'vitest';
import { boardContract, laneControlContract, shootoffContract } from '@/shared/ipc/contracts';

const ID = '11111111-1111-4111-8111-111111111111';

describe('IPC response contracts', () => {
  it('validates Lane-control DTOs instead of accepting arbitrary values', () => {
    const validResponse = {
      success: true,
      data: [
        {
          id: ID,
          channel: 1,
          player: null,
          phase: 'IDLE',
          unifiedPhase: 'IDLE',
          stageIndex: 0,
          seriesIndex: 0,
          roundType: 'Qualification',
          stageName: 'Idle',
          timer: null,
          preparationShots: [],
          matchShots: [],
          shootoffShots: [],
          eliminated: false,
          eliminationRank: null,
          totalScore: 0,
          stage1Total: 0,
          stage2Total: 0,
          seriesScores: [],
          recentShots: [],
          shotNumber: 0,
          lastScore: null,
          lastShotTime: null,
          remainingTime: 0,
          relayNumber: 1,
        },
      ],
    };

    expect(laneControlContract.procedures.getAll.output.safeParse(validResponse).success).toBe(true);
    expect(
      laneControlContract.procedures.getAll.output.safeParse({
        success: true,
        data: [{ id: ID, channel: 'one' }],
      }).success,
    ).toBe(false);
  });

  it('validates live-ranking DTOs instead of accepting arbitrary values', () => {
    const validResponse = {
      success: true,
      data: [
        {
          rank: 1,
          laneId: ID,
          channel: 1,
          playerName: 'Athlete',
          affiliation: 'Club',
          seriesScores: [102.1],
          totalScore: 102.1,
          average: 10.21,
          shotCount: 10,
          phase: 'ACTIVE',
        },
      ],
    };

    expect(boardContract.procedures.getLiveRanking.output.safeParse(validResponse).success).toBe(true);
    expect(
      boardContract.procedures.getLiveRanking.output.safeParse({
        success: true,
        data: [{ ...validResponse.data[0], totalScore: '102.1' }],
      }).success,
    ).toBe(false);
  });

  it('validates active shoot-off DTOs while allowing no active shoot-off', () => {
    const validResponse = {
      success: true,
      data: {
        shootoffId: ID,
        contestedRank: 2,
        currentRound: 0,
        isResolved: false,
        participantIds: ['participant-1', 'participant-2'],
      },
    };

    expect(shootoffContract.procedures.getActive.output.safeParse(validResponse).success).toBe(true);
    expect(shootoffContract.procedures.getActive.output.safeParse({ success: true, data: null }).success).toBe(true);
    expect(shootoffContract.procedures.getActive.output.safeParse({ success: false, data: null }).success).toBe(false);
    expect(
      shootoffContract.procedures.getActive.output.safeParse({
        success: true,
        data: { ...validResponse.data, participantIds: ['participant-1'] },
      }).success,
    ).toBe(false);
  });

  it('accepts the structured result returned when a shoot-off starts', () => {
    expect(
      shootoffContract.procedures.start.output.safeParse({
        success: true,
        data: { shootoffId: ID },
      }).success,
    ).toBe(true);
    expect(
      shootoffContract.procedures.start.output.safeParse({
        success: true,
        data: ID,
      }).success,
    ).toBe(false);
  });
});
