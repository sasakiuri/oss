import { describe, expect, it } from 'vitest';
import { ISSF_2026_RFPM } from '@sasakiuri/saika-rules';

import { ChampionshipId } from '@/main/modules/championship/domain/ChampionshipId';
import { Event } from '@/main/modules/championship/domain/Event';
import { EventId } from '@/main/modules/championship/domain/EventId';
import { EventType } from '@/main/modules/championship/domain/EventType';
import type { IEventRepository } from '@/main/modules/championship/domain/IEventRepository';
import type { IParticipantRepository } from '@/main/modules/championship';
import { Participant, ParticipantId } from '@/main/modules/championship';
import { Channel, InMemoryLaneControlRepository, LaneControl, Player, Round } from '@/main/modules/lane-control';
import {
  DirectorQualificationMalfunctionSubjectResolver,
  RegistryQualificationMalfunctionPolicyResolver,
} from '@/main/modules/qualification-malfunctions';
import { buildRoundConfig } from '@/shared/constants/roundConfig';
import { CompetitionTypeRegistry, competitionTypeFromRulePack } from '@/shared/competitionTypes';

const championshipId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const participantId = '33333333-3333-4333-8333-333333333333';
const laneId = '44444444-4444-4444-8444-444444444444';

describe('qualification malfunction context resolvers', () => {
  it('derives stage policy from the event binding and rejects a changed Rule Pack', () => {
    const registry = new CompetitionTypeRegistry();
    const definition = competitionTypeFromRulePack(ISSF_2026_RFPM);
    registry.register(definition);
    let event = createEvent(registry, definition.rulePackIdentity!);
    const events = { findById: () => event } as unknown as IEventRepository;
    const resolver = new RegistryQualificationMalfunctionPolicyResolver(events, registry);

    expect(resolver.resolve({ eventId, stageIndex: 1, seriesIndex: 0 })).toMatchObject({
      competitionTypeId: 'RFPM',
      phase: 'MATCH',
      stageId: 'STAGE_1',
      seriesShotLimit: 5,
      timedTargetProgramId: 'RFP_MATCH_8',
    });

    event = createEvent(registry, {
      ...definition.rulePackIdentity!,
      fingerprint: { algorithm: 'SHA-256', value: 'a'.repeat(64) },
    });
    expect(() => resolver.resolve({ eventId, stageIndex: 1, seriesIndex: 0 })).toThrow(
      'does not match the registered competition type',
    );
  });

  it('requires Lane-originated reports to match live athlete and firing context', () => {
    const definition = competitionTypeFromRulePack(ISSF_2026_RFPM);
    let lane = LaneControl.create(laneId, Channel.create(7), buildRoundConfig(definition), 2);
    lane = lane.assignPlayer(Player.create('Athlete A', 'Club', participantId));
    lane = lane.startPreparation().advanceToNextStage().startMatch();
    const lanes = new InMemoryLaneControlRepository();
    lanes.save(lane);
    const participant = Participant.create(
      ParticipantId.create(participantId),
      EventId.create(eventId),
      'Athlete A',
      'Club',
      null,
      0,
      'Athlete',
      { startNumber: '101' },
    );
    const participants = { findById: () => participant } as unknown as IParticipantRepository;
    const resolver = new DirectorQualificationMalfunctionSubjectResolver(
      participants,
      lanes,
      () => new Date('2026-09-04T01:00:00.000Z'),
    );

    expect(
      resolver.resolve({
        eventId,
        participantId,
        laneId,
        laneChannel: 7,
        relayNumber: 2,
        stageIndex: 1,
        seriesIndex: 0,
        recordedShots: 0,
        reportSource: 'LANE_SIGNAL',
      }),
    ).toEqual({
      participantName: 'Athlete A',
      startNumber: '101',
      laneSnapshotCapturedAt: new Date('2026-09-04T01:00:00.000Z'),
    });
    expect(() =>
      resolver.resolve({
        eventId,
        participantId,
        laneId,
        laneChannel: 8,
        relayNumber: 2,
        stageIndex: 1,
        seriesIndex: 0,
        recordedShots: 0,
        reportSource: 'LANE_SIGNAL',
      }),
    ).toThrow('live channel and relay');

    expect(
      resolver.resolve({
        eventId,
        participantId,
        laneId: crypto.randomUUID(),
        laneChannel: 99,
        relayNumber: 9,
        stageIndex: 2,
        seriesIndex: 3,
        recordedShots: 4,
        reportSource: 'DIRECTOR_MANUAL',
      }),
    ).toMatchObject({ laneSnapshotCapturedAt: null });
  });
});

function createEvent(
  registry: CompetitionTypeRegistry,
  identity: NonNullable<ReturnType<typeof competitionTypeFromRulePack>['rulePackIdentity']>,
): Event {
  return Event.create(
    EventId.create(eventId),
    ChampionshipId.create(championshipId),
    '25m Rapid Fire Pistol',
    EventType.create('RFPM', registry),
    Round.create('Qualification'),
    0,
    identity,
  );
}
