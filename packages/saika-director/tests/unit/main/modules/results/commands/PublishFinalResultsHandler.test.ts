// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Player } from '@/main/modules/lane-control/domain/Player';
import { PublishFinalResultsHandler } from '@/main/modules/results/commands/PublishFinalResultsHandler';
import { FinalResult } from '@/main/modules/results/domain/FinalResult';
import type { IFinalResultRepository } from '@/main/modules/results/domain/IFinalResultRepository';
import { competitionTypeRegistry } from '@/shared/competitionTypes';
import { BR60S_FINAL } from '@/shared/competitionTypes/definitions/BR60S_FINAL';
import { IssfStandardStrategy } from '@/shared/competitionTypes/strategies/IssfStandardStrategy';
import { buildFinalConfig } from '../../../../../helpers/testConfigs';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const VALID_LANE_ID = '22222222-2222-4222-8222-222222222222';
const MISSING_LANE_ID = '33333333-3333-4333-8333-333333333333';
const PARTICIPANT_ID = '44444444-4444-4444-8444-444444444444';
const SECOND_LANE_ID = '55555555-5555-4555-8555-555555555555';

function createFinalLane(
  laneId = VALID_LANE_ID,
  channel = 1,
  participantId = PARTICIPANT_ID,
  playerName = 'Final Athlete',
): LaneControl {
  return LaneControl.create(laneId, Channel.create(channel), buildFinalConfig(2)).assignPlayer(
    Player.create(playerName, 'Tokyo', participantId),
  );
}

describe('PublishFinalResultsHandler', () => {
  let repository: IFinalResultRepository;
  let lanes: Map<string, LaneControl>;
  let eventExists: boolean;
  let handler: PublishFinalResultsHandler;

  beforeEach(() => {
    lanes = new Map([[VALID_LANE_ID, createFinalLane()]]);
    eventExists = true;
    repository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByEventId: vi.fn(),
      findByParticipantId: vi.fn(),
      updateStatus: vi.fn(),
      delete: vi.fn(),
      deleteByEventId: vi.fn(),
      executeInTransaction: vi.fn((fn: () => void) => fn()),
    };
    const queryBus = {
      execute: vi.fn(async (token: { name: string }, input: { eventId?: string; laneId?: string }) => {
        if (token.name === 'GetEventById') {
          return eventExists
            ? {
                id: input.eventId,
                name: 'Final',
                eventType: 'BR60S_FINAL',
                round: 'Final',
                sortOrder: 0,
              }
            : null;
        }
        if (token.name === 'GetLaneById' && input.laneId) return lanes.get(input.laneId);
        return undefined;
      }),
    };

    competitionTypeRegistry._reset();
    competitionTypeRegistry.registerStrategy(new IssfStandardStrategy());
    competitionTypeRegistry.register(BR60S_FINAL);
    handler = new PublishFinalResultsHandler(queryBus as never, repository, competitionTypeRegistry);
  });

  it('atomically replaces the event result set when every Lane is valid', async () => {
    const result = await handler.execute({ eventId: EVENT_ID, laneIds: [VALID_LANE_ID] });

    expect(result).toEqual({ savedCount: 1, errors: [] });
    expect(repository.executeInTransaction).toHaveBeenCalledOnce();
    expect(repository.deleteByEventId).toHaveBeenCalledWith(EVENT_ID);
    expect(repository.save).toHaveBeenCalledOnce();
  });

  it('preserves the existing result set when any requested Lane is invalid', async () => {
    const result = await handler.execute({
      eventId: EVENT_ID,
      laneIds: [VALID_LANE_ID, MISSING_LANE_ID],
    });

    expect(result).toEqual({ savedCount: 0, errors: [`Lane ${MISSING_LANE_ID} not found`] });
    expect(repository.executeInTransaction).not.toHaveBeenCalled();
    expect(repository.deleteByEventId).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('returns a structured error without modifying results when the event is missing', async () => {
    eventExists = false;

    const result = await handler.execute({ eventId: EVENT_ID, laneIds: [VALID_LANE_ID] });

    expect(result).toEqual({ savedCount: 0, errors: [`Event ${EVENT_ID} not found`] });
    expect(repository.executeInTransaction).not.toHaveBeenCalled();
  });

  it('preserves the existing result set when an entity cannot be built', async () => {
    const reconstruct = vi.spyOn(FinalResult, 'reconstruct').mockImplementationOnce(() => {
      throw new Error('invalid final result');
    });

    const result = await handler.execute({ eventId: EVENT_ID, laneIds: [VALID_LANE_ID] });

    expect(result).toMatchObject({
      savedCount: 0,
      errors: [expect.stringContaining(`Failed to build final result for lane ${VALID_LANE_ID}`)],
    });
    expect(repository.executeInTransaction).not.toHaveBeenCalled();
    expect(repository.deleteByEventId).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    reconstruct.mockRestore();
  });

  it('rejects duplicate Lane IDs without replacing the event result set', async () => {
    const result = await handler.execute({ eventId: EVENT_ID, laneIds: [VALID_LANE_ID, VALID_LANE_ID] });

    expect(result).toEqual({ savedCount: 0, errors: ['Final result Lane IDs must be unique'] });
    expect(repository.executeInTransaction).not.toHaveBeenCalled();
    expect(repository.deleteByEventId).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects an athlete assigned to multiple Lanes without replacing results', async () => {
    lanes.set(SECOND_LANE_ID, createFinalLane(SECOND_LANE_ID, 2, PARTICIPANT_ID, 'Duplicate Athlete'));

    const result = await handler.execute({ eventId: EVENT_ID, laneIds: [VALID_LANE_ID, SECOND_LANE_ID] });

    expect(result).toEqual({
      savedCount: 0,
      errors: [`Participant ${PARTICIPANT_ID} is assigned to multiple Lanes: ${VALID_LANE_ID} and ${SECOND_LANE_ID}`],
    });
    expect(repository.executeInTransaction).not.toHaveBeenCalled();
    expect(repository.deleteByEventId).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
});
