// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PublishMqttResultsHandler } from '@/main/modules/results/commands/PublishMqttResultsHandler';
import type { PublishMqttResultLane } from '@/main/modules/results/commands/PublishMqttResults';
import type { IResultRepository } from '@/main/modules/results/domain/IResultRepository';
import { GetEventByIdToken, GetFiringPointAssignmentsByRelayToken } from '@/main/modules/championship';
import { competitionTypeRegistry } from '@/shared/competitionTypes';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';
import { IssfStandardStrategy } from '@/shared/competitionTypes/strategies/IssfStandardStrategy';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const LANE_ID = '33333333-3333-4333-8333-333333333333';
const PARTICIPANT_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const SECOND_PARTICIPANT_ID = '66666666-6666-4666-8666-666666666666';

function createLaneResultData({
  totalScoreX10 = 205,
  participantId = PARTICIPANT_ID,
}: {
  totalScoreX10?: number;
  participantId?: string;
} = {}): PublishMqttResultLane {
  return {
    laneId: LANE_ID,
    assignment: {
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      athlete: {
        startNumber: 1,
        id: participantId,
        name: 'Alex Smith',
        teamName: 'Tokyo',
      },
      assignedAt: '2026-08-26T00:00:00.000Z',
      publishedAt: '2026-08-26T00:00:00.000Z',
    },
    score: {
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      sessionId: SESSION_ID,
      totalScoreX10,
      totalShotCount: 2,
      acc: 'DECIMAL',
      stages: [
        {
          stageIndex: 1,
          stageName: 'Match',
          stageTotalX10: totalScoreX10,
          series: [
            {
              seriesIndex: 0,
              shots: [totalScoreX10 - 100, 100],
              seriesTotalX10: totalScoreX10,
              isComplete: true,
            },
          ],
        },
      ],
      publishedAt: '2026-08-26T00:00:00.000Z',
    },
    shots: [],
  };
}

describe('PublishMqttResultsHandler', () => {
  let repository: IResultRepository;
  let handler: PublishMqttResultsHandler;
  let queryBusExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    repository = {
      save: vi.fn(),
      replaceByCompetitionId: vi.fn(),
      findById: vi.fn(),
      findByEventId: vi.fn(),
      findByEventIdAndRelay: vi.fn().mockReturnValue([]),
      findByCompetitionId: vi.fn().mockReturnValue([]),
      findByParticipantId: vi.fn(),
      deleteById: vi.fn(),
      deleteByEventId: vi.fn(),
      updateStatus: vi.fn(),
    };
    queryBusExecute = vi.fn(async (token: { name: string }) => {
      if (token.name === GetEventByIdToken.name) {
        return {
          id: EVENT_ID,
          name: 'Qualification',
          eventType: 'BR60S',
          round: 'Qualification',
          sortOrder: 0,
        };
      }
      if (token.name === GetFiringPointAssignmentsByRelayToken.name) {
        return [
          {
            firingPointNumber: 1,
            participantId: PARTICIPANT_ID,
            playerName: 'Canonical Athlete',
            familyName: 'Athlete',
            affiliation: 'Canonical Team',
          },
          {
            firingPointNumber: 2,
            participantId: SECOND_PARTICIPANT_ID,
            playerName: 'Second Athlete',
            familyName: 'Athlete',
            affiliation: 'Second Team',
          },
        ];
      }
      throw new Error(`Unexpected query: ${token.name}`);
    });
    const queryBus = { execute: queryBusExecute };
    competitionTypeRegistry._reset();
    competitionTypeRegistry.registerStrategy(new IssfStandardStrategy());
    competitionTypeRegistry.register(BR60S);
    handler = new PublishMqttResultsHandler(queryBus as never, repository, competitionTypeRegistry);
  });

  it('saves a tournament result from the final MQTT assignment and score', async () => {
    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 2,
      lanes: [
        {
          laneId: LANE_ID,
          assignment: {
            competitionId: COMPETITION_ID,
            laneId: LANE_ID,
            athlete: {
              startNumber: 1,
              id: PARTICIPANT_ID,
              name: 'Alex Smith',
              teamName: 'Tokyo',
            },
            assignedAt: '2026-08-26T00:00:00.000Z',
            publishedAt: '2026-08-26T00:00:00.000Z',
          },
          score: {
            competitionId: COMPETITION_ID,
            laneId: LANE_ID,
            sessionId: SESSION_ID,
            totalScoreX10: 205,
            totalShotCount: 2,
            acc: 'DECIMAL',
            stages: [
              {
                stageIndex: 1,
                stageName: 'Match',
                stageTotalX10: 205,
                series: [
                  {
                    seriesIndex: 0,
                    shots: [105, 100],
                    seriesTotalX10: 205,
                    isComplete: true,
                  },
                ],
              },
            ],
            publishedAt: '2026-08-26T00:00:00.000Z',
          },
          shots: [],
        },
      ],
    });

    expect(response).toEqual({ savedCount: 1, errors: [] });
    expect(repository.replaceByCompetitionId).toHaveBeenCalledOnce();
    expect(repository.replaceByCompetitionId).toHaveBeenCalledWith(EVENT_ID, 2, COMPETITION_ID, [expect.anything()]);
    const saved = vi.mocked(repository.replaceByCompetitionId).mock.calls[0]![3][0]!;
    expect(saved).toMatchObject({
      playerName: 'Canonical Athlete',
      familyName: 'Athlete',
      affiliation: 'Canonical Team',
      totalScore: 20.5,
      relayNumber: 2,
      sourceCompetitionId: COMPETITION_ID,
      sourceLaneId: LANE_ID,
    });
    expect(saved.seriesScores.slice(0, 2)).toEqual([20.5, 0]);
    expect(saved.shots.slice(0, 3)).toEqual([10.5, 10, 0]);
  });

  it('attaches independent X and decimal evidence without changing the retained score', async () => {
    const lane = createLaneResultData();
    lane.shots = [
      {
        laneId: LANE_ID,
        shotId: '77777777-7777-4777-8777-777777777777',
        x: 0,
        y: 0,
        rawScoreX10: 105,
        deviceScoreX10: 104,
        calculatedScoreX10: 106,
        effectiveScoreX10: 105,
        innerTen: true,
        mode: 'MATCH',
        timestamp: '2026-08-26T00:00:00.000Z',
        competitionId: COMPETITION_ID,
        sessionId: SESSION_ID,
        stageIndex: 1,
        scored: true,
        seriesIndex: 0,
        shotNumberInSeries: 1,
        isRecorded: true,
        isReplay: false,
        publishedAt: '2026-08-26T00:00:00.010Z',
      },
      {
        laneId: LANE_ID,
        shotId: '88888888-8888-4888-8888-888888888888',
        x: 1,
        y: 0,
        rawScoreX10: 100,
        calculatedScoreX10: 101,
        effectiveScoreX10: 100,
        innerTen: false,
        mode: 'MATCH',
        timestamp: '2026-08-26T00:00:01.000Z',
        competitionId: COMPETITION_ID,
        sessionId: SESSION_ID,
        stageIndex: 1,
        scored: true,
        seriesIndex: 0,
        shotNumberInSeries: 2,
        isRecorded: true,
        isReplay: false,
        publishedAt: '2026-08-26T00:00:01.010Z',
      },
    ];

    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 2,
      lanes: [lane],
    });

    expect(response).toEqual({ savedCount: 1, errors: [] });
    const saved = vi.mocked(repository.replaceByCompetitionId).mock.calls[0]![3][0]!;
    expect(saved.totalScore).toBe(20.5);
    expect(saved.rankingShots).toHaveLength(60);
    expect(saved.rankingShots.slice(0, 2)).toEqual([
      {
        ringScore: 10,
        decimalScore: 10.4,
        decimalScoreSource: 'DEVICE',
        innerTen: true,
        innerTenSource: 'CALCULATED',
        scoreConflict: true,
        shotId: lane.shots[0]!.shotId,
        seriesIndex: 0,
      },
      {
        ringScore: 10,
        decimalScore: null,
        decimalScoreSource: null,
        innerTen: false,
        innerTenSource: 'CALCULATED',
        scoreConflict: false,
        shotId: lane.shots[1]!.shotId,
        seriesIndex: 0,
      },
    ]);
  });

  it('uses canonical tournament identity instead of echoed MQTT athlete text', async () => {
    const lane = createLaneResultData();
    lane.assignment = {
      ...lane.assignment!,
      athlete: {
        ...lane.assignment!.athlete!,
        name: 'Altered Lane Name',
        teamName: 'Altered Lane Team',
      },
    };

    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 2,
      lanes: [lane],
    });

    expect(response).toEqual({ savedCount: 1, errors: [] });
    expect(vi.mocked(repository.replaceByCompetitionId).mock.calls[0]![3][0]).toMatchObject({
      playerName: 'Canonical Athlete',
      affiliation: 'Canonical Team',
    });
  });

  it('does not restore pre-reset shot events when the retained score has no shots', async () => {
    const lane = createLaneResultData({ totalScoreX10: 0 });
    lane.score = {
      ...lane.score!,
      totalShotCount: 0,
      stages: [
        {
          stageIndex: 1,
          stageName: 'Match',
          stageTotalX10: 0,
          series: [
            {
              seriesIndex: 0,
              shots: [],
              seriesTotalX10: 0,
              isComplete: false,
            },
          ],
        },
      ],
    };
    lane.shots = [
      {
        laneId: LANE_ID,
        shotId: '77777777-7777-4777-8777-777777777777',
        x: 0,
        y: 0,
        rawScoreX10: 105,
        innerTen: false,
        mode: 'MATCH',
        timestamp: '2026-08-26T00:00:00.000Z',
        competitionId: COMPETITION_ID,
        sessionId: SESSION_ID,
        stageIndex: 1,
        scored: true,
        seriesIndex: 0,
        shotNumberInSeries: 1,
        isRecorded: true,
        isReplay: false,
        publishedAt: '2026-08-26T00:00:00.000Z',
      },
    ];

    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 2,
      lanes: [lane],
    });

    expect(response).toEqual({ savedCount: 1, errors: [] });
    const saved = vi.mocked(repository.replaceByCompetitionId).mock.calls[0]![3][0]!;
    expect(saved.totalScore).toBe(0);
    expect(saved.shots.every((shot) => shot === 0)).toBe(true);
  });

  it('does not save a Lane whose assignment or score belongs to another competition', async () => {
    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 1,
      lanes: [{ laneId: LANE_ID, assignment: null, score: null, shots: [] }],
    });

    expect(response.savedCount).toBe(0);
    expect(response.errors).toEqual([`Lane ${LANE_ID} has no tournament athlete assigned`]);
    expect(repository.replaceByCompetitionId).not.toHaveBeenCalled();
  });

  it('rejects a Lane score whose scoring mode differs from the event type', async () => {
    const lane = createLaneResultData();
    lane.score = { ...lane.score!, acc: 'RING' };

    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 2,
      lanes: [lane],
    });

    expect(response).toMatchObject({
      savedCount: 0,
      errors: [expect.stringContaining('BR60S requires DECIMAL')],
    });
    expect(repository.replaceByCompetitionId).not.toHaveBeenCalled();
  });

  it('does not erase an existing relay when no Lane result data is available', async () => {
    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 1,
      lanes: [],
    });

    expect(response).toMatchObject({ savedCount: 0, errors: [expect.stringContaining('has no Lane result data')] });
    expect(repository.replaceByCompetitionId).not.toHaveBeenCalled();
  });

  it('rejects a Lane athlete who belongs to a different relay', async () => {
    const staleParticipantId = '77777777-7777-4777-8777-777777777777';
    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 2,
      lanes: [createLaneResultData({ participantId: staleParticipantId })],
    });

    expect(response).toMatchObject({
      savedCount: 0,
      errors: [expect.stringContaining(`Participant ${staleParticipantId} on Lane ${LANE_ID} is not assigned`)],
    });
    expect(queryBusExecute).toHaveBeenCalledWith(GetFiringPointAssignmentsByRelayToken, {
      eventId: EVENT_ID,
      relayNumber: 2,
    });
    expect(repository.replaceByCompetitionId).not.toHaveBeenCalled();
  });

  it('does not partially update results when any requested Lane is invalid', async () => {
    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 1,
      lanes: [
        {
          laneId: LANE_ID,
          assignment: {
            competitionId: COMPETITION_ID,
            laneId: LANE_ID,
            athlete: {
              startNumber: 1,
              id: PARTICIPANT_ID,
              name: 'Alex Smith',
            },
            assignedAt: '2026-08-26T00:00:00.000Z',
            publishedAt: '2026-08-26T00:00:00.000Z',
          },
          score: {
            competitionId: COMPETITION_ID,
            laneId: LANE_ID,
            sessionId: SESSION_ID,
            totalScoreX10: 100,
            totalShotCount: 1,
            acc: 'DECIMAL',
            stages: [
              {
                stageIndex: 1,
                stageName: 'Match',
                stageTotalX10: 100,
                series: [
                  {
                    seriesIndex: 0,
                    shots: [100],
                    seriesTotalX10: 100,
                    isComplete: false,
                  },
                ],
              },
            ],
            publishedAt: '2026-08-26T00:00:00.000Z',
          },
          shots: [],
        },
        {
          laneId: '66666666-6666-4666-8666-666666666666',
          assignment: null,
          score: null,
          shots: [],
        },
      ],
    });

    expect(response).toMatchObject({ savedCount: 0, errors: [expect.stringContaining('has no tournament athlete')] });
    expect(repository.replaceByCompetitionId).not.toHaveBeenCalled();
  });

  it('rejects duplicate participant assignments instead of silently replacing a result', async () => {
    const lane: PublishMqttResultLane = {
      laneId: LANE_ID,
      assignment: {
        competitionId: COMPETITION_ID,
        laneId: LANE_ID,
        athlete: {
          startNumber: 1,
          id: PARTICIPANT_ID,
          name: 'Alex Smith',
        },
        assignedAt: '2026-08-26T00:00:00.000Z',
        publishedAt: '2026-08-26T00:00:00.000Z',
      },
      score: {
        competitionId: COMPETITION_ID,
        laneId: LANE_ID,
        sessionId: SESSION_ID,
        totalScoreX10: 100,
        totalShotCount: 1,
        acc: 'DECIMAL',
        stages: [],
        publishedAt: '2026-08-26T00:00:00.000Z',
      },
      shots: [],
    };
    const duplicateLaneId = '66666666-6666-4666-8666-666666666666';
    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 1,
      lanes: [
        lane,
        {
          ...lane,
          laneId: duplicateLaneId,
          assignment: { ...lane.assignment!, laneId: duplicateLaneId },
          score: {
            ...lane.score!,
            laneId: duplicateLaneId,
            sessionId: '77777777-7777-4777-8777-777777777777',
          },
        },
      ],
    });

    expect(response).toMatchObject({
      savedCount: 0,
      errors: [expect.stringContaining(`Participant ${PARTICIPANT_ID} is assigned to multiple Lanes`)],
    });
    expect(repository.replaceByCompetitionId).not.toHaveBeenCalled();
  });

  it('does not replace a participant result from another relay', async () => {
    vi.mocked(repository.findByParticipantId).mockReturnValue({
      eventId: { value: EVENT_ID },
      relayNumber: 1,
    } as never);

    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 2,
      lanes: [
        {
          laneId: LANE_ID,
          assignment: {
            competitionId: COMPETITION_ID,
            laneId: LANE_ID,
            athlete: {
              startNumber: 1,
              id: PARTICIPANT_ID,
              name: 'Alex Smith',
            },
            assignedAt: '2026-08-26T00:00:00.000Z',
            publishedAt: '2026-08-26T00:00:00.000Z',
          },
          score: {
            competitionId: COMPETITION_ID,
            laneId: LANE_ID,
            sessionId: SESSION_ID,
            totalScoreX10: 100,
            totalShotCount: 1,
            acc: 'DECIMAL',
            stages: [],
            publishedAt: '2026-08-26T00:00:00.000Z',
          },
          shots: [],
        },
      ],
    });

    expect(response).toMatchObject({
      savedCount: 0,
      errors: [expect.stringContaining(`Participant ${PARTICIPANT_ID} already has a result`)],
    });
    expect(repository.replaceByCompetitionId).not.toHaveBeenCalled();
  });

  it('allows a later competition to correct an unconfirmed result in the same relay', async () => {
    const otherCompetitionId = '88888888-8888-4888-8888-888888888888';
    vi.mocked(repository.findByParticipantId).mockReturnValue({
      eventId: { value: EVENT_ID },
      relayNumber: 2,
      sourceCompetitionId: otherCompetitionId,
      status: 'published',
    } as never);

    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 2,
      lanes: [createLaneResultData()],
    });

    expect(response).toEqual({ savedCount: 1, errors: [] });
    expect(repository.replaceByCompetitionId).toHaveBeenCalledWith(EVENT_ID, 2, COMPETITION_ID, [expect.anything()]);
    expect(vi.mocked(repository.replaceByCompetitionId).mock.calls[0]![3][0]).toMatchObject({
      sourceCompetitionId: COMPETITION_ID,
    });
  });

  it('does not replace a confirmed result owned by another competition', async () => {
    const otherCompetitionId = '88888888-8888-4888-8888-888888888888';
    vi.mocked(repository.findByParticipantId).mockReturnValue({
      eventId: { value: EVENT_ID },
      relayNumber: 2,
      sourceCompetitionId: otherCompetitionId,
      status: 'confirmed',
    } as never);

    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 2,
      lanes: [createLaneResultData()],
    });

    expect(response).toMatchObject({
      savedCount: 0,
      errors: [expect.stringContaining(`has a confirmed result from competition ${otherCompetitionId}`)],
    });
    expect(repository.replaceByCompetitionId).not.toHaveBeenCalled();
  });

  it('does not require confirmed results from another competition in the relay', async () => {
    vi.mocked(repository.findByEventIdAndRelay).mockReturnValue([
      {
        participantId: { value: SECOND_PARTICIPANT_ID },
        status: 'confirmed',
      } as never,
    ]);

    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 2,
      lanes: [createLaneResultData()],
    });

    expect(response).toEqual({ savedCount: 1, errors: [] });
    expect(repository.findByCompetitionId).toHaveBeenCalledWith(EVENT_ID, 2, COMPETITION_ID);
    expect(repository.findByEventIdAndRelay).not.toHaveBeenCalled();
  });

  it('preserves an identical confirmed result during an idempotent publication retry', async () => {
    const command = {
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 2,
      lanes: [createLaneResultData()],
    };
    await handler.execute(command);
    const published = vi.mocked(repository.replaceByCompetitionId).mock.calls[0]![3][0]!;
    const confirmed = published.confirm();
    vi.mocked(repository.findByParticipantId).mockReturnValue(confirmed);
    vi.mocked(repository.findByCompetitionId).mockReturnValue([confirmed]);
    vi.mocked(repository.replaceByCompetitionId).mockClear();

    const response = await handler.execute(command);

    expect(response).toEqual({ savedCount: 1, errors: [] });
    expect(repository.replaceByCompetitionId).toHaveBeenCalledWith(EVENT_ID, 2, COMPETITION_ID, [confirmed]);
  });

  it('does not overwrite a confirmed result with different Lane data', async () => {
    const originalCommand = {
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 2,
      lanes: [createLaneResultData()],
    };
    await handler.execute(originalCommand);
    const confirmed = vi.mocked(repository.replaceByCompetitionId).mock.calls[0]![3][0]!.confirm();
    vi.mocked(repository.findByParticipantId).mockReturnValue(confirmed);
    vi.mocked(repository.findByCompetitionId).mockReturnValue([confirmed]);
    vi.mocked(repository.replaceByCompetitionId).mockClear();

    const response = await handler.execute({
      ...originalCommand,
      lanes: [createLaneResultData({ totalScoreX10: 206 })],
    });

    expect(response).toMatchObject({
      savedCount: 0,
      errors: [expect.stringContaining('has a confirmed result that differs')],
    });
    expect(repository.replaceByCompetitionId).not.toHaveBeenCalled();
  });

  it('does not delete a confirmed result omitted from replacement Lane data', async () => {
    const initialCommand = {
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 2,
      lanes: [createLaneResultData()],
    };
    await handler.execute(initialCommand);
    const confirmed = vi.mocked(repository.replaceByCompetitionId).mock.calls[0]![3][0]!.confirm();
    vi.mocked(repository.findByCompetitionId).mockReturnValue([confirmed]);
    vi.mocked(repository.replaceByCompetitionId).mockClear();

    const response = await handler.execute({
      ...initialCommand,
      lanes: [createLaneResultData({ participantId: SECOND_PARTICIPANT_ID })],
    });

    expect(response).toMatchObject({
      savedCount: 0,
      errors: [expect.stringContaining(`Confirmed result for participant ${PARTICIPANT_ID} is missing`)],
    });
    expect(repository.replaceByCompetitionId).not.toHaveBeenCalled();
  });

  it('rejects a publication target with a different competition type', async () => {
    queryBusExecute.mockResolvedValue({
      id: EVENT_ID,
      name: 'Pistol Qualification',
      eventType: 'BP60',
      round: 'Qualification',
      sortOrder: 0,
    });

    const response = await handler.execute({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      eventId: EVENT_ID,
      relayNumber: 1,
      lanes: [{ laneId: LANE_ID, assignment: null, score: null, shots: [] }],
    });

    expect(response).toMatchObject({
      savedCount: 0,
      errors: [expect.stringContaining('uses competition type BP60')],
    });
    expect(repository.replaceByCompetitionId).not.toHaveBeenCalled();
  });
});
