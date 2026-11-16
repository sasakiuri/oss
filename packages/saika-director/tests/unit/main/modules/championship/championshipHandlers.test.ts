// SPDX-License-Identifier: MIT
import { ISSF_2026_AR60 } from '@sasakiuri/saika-rules';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GetEventByIdToken } from '@/main/modules/championship/application/championshipQueries';
import { championshipModule } from '@/main/modules/championship/championship.module';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { CompetitionTypeRegistry, competitionTypeFromRulePack } from '@/shared/competitionTypes';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';
import { BR60S_FINAL } from '@/shared/competitionTypes/definitions/BR60S_FINAL';
import { IssfStandardStrategy } from '@/shared/competitionTypes/strategies/IssfStandardStrategy';
import type {
  ChampionshipDetailDto,
  ChampionshipListResponse,
  CompetitionTypeListResponse,
  CreateChampionshipPayload,
  CreateEventPayload,
  DeleteChampionshipPayload,
  DeleteEventPayload,
  FiringPointAssignmentListResponse,
  ParticipantListResponse,
  SaveFiringPointAssignmentsPayload,
  SaveParticipantsPayload,
  UpdateChampionshipPayload,
  UpdateEventPayload,
} from '@/shared/ipc/contracts/championship.contract';

import { migratedDatabase } from '../../../../helpers/database';

interface Handlers {
  create(input: CreateChampionshipPayload): Promise<string>;
  update(input: UpdateChampionshipPayload): Promise<void>;
  delete(input: DeleteChampionshipPayload): Promise<void>;
  createEvent(input: CreateEventPayload): Promise<string>;
  updateEvent(input: UpdateEventPayload): Promise<void>;
  deleteEvent(input: DeleteEventPayload): Promise<void>;
  saveParticipants(input: SaveParticipantsPayload): Promise<ParticipantListResponse>;
  saveFiringPointAssignments(input: SaveFiringPointAssignmentsPayload): Promise<FiringPointAssignmentListResponse>;
  getAll(): Promise<ChampionshipListResponse>;
  getDetail(input: { id: string }): Promise<ChampionshipDetailDto | null>;
  getParticipants(input: { eventId: string }): Promise<ParticipantListResponse>;
  getFiringPointAssignments(input: { eventId: string }): Promise<FiringPointAssignmentListResponse>;
  getCompetitionTypes(): Promise<CompetitionTypeListResponse>;
}

describe('championship module handlers on a migrated database', () => {
  let database: Database.Database;
  let handlers: Handlers;
  let getEventById: (query: { eventId: string }) => Promise<unknown>;
  const AR60 = competitionTypeFromRulePack(ISSF_2026_AR60);

  beforeEach(() => {
    database = migratedDatabase();
    database.pragma('foreign_keys = ON');
    const registry = new CompetitionTypeRegistry();
    registry.registerStrategy(new IssfStandardStrategy());
    registry.register(BR60S);
    registry.register(BR60S_FINAL);
    registry.register(AR60);
    const ipcRouter = {
      register: (_contract: unknown, registered: Handlers) => {
        handlers = registered;
      },
    } as unknown as IpcRouter;
    const queryBus = {
      register: (token: { name: string }, handler: (query: { eventId: string }) => Promise<unknown>) => {
        if (token.name === GetEventByIdToken.name) getEventById = handler;
      },
    } as unknown as QueryBus;
    championshipModule.register({ database, queryBus, ipcRouter, competitionTypeRegistry: registry });
  });

  afterEach(() => database.close());

  async function createChampionship() {
    return handlers.create({ name: 'Autumn Cup', date: '2026-10-01', venue: 'Range A' });
  }

  it('creates, lists, updates and deletes championships', async () => {
    const id = await createChampionship();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await handlers.getAll()).toEqual({
      championships: [{ id, name: 'Autumn Cup', date: '2026-10-01', venue: 'Range A', createdAt: expect.any(String) }],
    });

    await handlers.update({ id, venue: 'Range B' });
    expect(await handlers.getDetail({ id })).toEqual({
      id,
      name: 'Autumn Cup',
      date: '2026-10-01',
      venue: 'Range B',
      createdAt: expect.any(String),
      events: [],
    });
    await expect(handlers.update({ id: 'missing', name: 'x' })).rejects.toThrow(
      new Error('Championship not found: missing'),
    );

    await handlers.delete({ id });
    expect(await handlers.getAll()).toEqual({ championships: [] });
    expect(await handlers.getDetail({ id })).toBeNull();
  });

  it('creates events in order with the round and Rule Pack identity of their competition type', async () => {
    const championshipId = await createChampionship();
    const qualification = await handlers.createEvent({ championshipId, name: 'Qualification', eventType: 'BR60S' });
    const final = await handlers.createEvent({ championshipId, name: 'Final', eventType: 'BR60S_FINAL' });
    const issf = await handlers.createEvent({ championshipId, name: 'Air Rifle', eventType: AR60.id });

    const detail = await handlers.getDetail({ id: championshipId });
    expect(detail?.events).toEqual([
      {
        id: qualification,
        name: 'Qualification',
        eventType: 'BR60S',
        round: 'Qualification',
        sortOrder: 0,
        rulePackIdentity: BR60S.rulePackIdentity ?? null,
      },
      {
        id: final,
        name: 'Final',
        eventType: 'BR60S_FINAL',
        round: 'Final',
        sortOrder: 1,
        rulePackIdentity: BR60S_FINAL.rulePackIdentity ?? null,
      },
      {
        id: issf,
        name: 'Air Rifle',
        eventType: AR60.id,
        round: 'Qualification',
        sortOrder: 2,
        rulePackIdentity: AR60.rulePackIdentity,
      },
    ]);
    await expect(getEventById({ eventId: final })).resolves.toEqual({
      id: final,
      name: 'Final',
      eventType: 'BR60S_FINAL',
      round: 'Final',
      sortOrder: 1,
      rulePackIdentity: BR60S_FINAL.rulePackIdentity ?? null,
    });
    await expect(getEventById({ eventId: 'missing' })).resolves.toBeNull();
  });

  it('keeps the Rule Pack identity of a renamed event and takes the identity of a new competition type', async () => {
    const championshipId = await createChampionship();
    const eventId = await handlers.createEvent({ championshipId, name: 'Air Rifle', eventType: AR60.id });

    await handlers.updateEvent({ id: eventId, name: 'Air Rifle Men', eventType: AR60.id });
    expect((await handlers.getDetail({ id: championshipId }))?.events[0]).toMatchObject({
      name: 'Air Rifle Men',
      rulePackIdentity: AR60.rulePackIdentity,
    });
    await handlers.updateEvent({ id: eventId, name: 'Final', eventType: 'BR60S_FINAL' });
    expect((await handlers.getDetail({ id: championshipId }))?.events[0]).toMatchObject({
      name: 'Final',
      eventType: 'BR60S_FINAL',
      round: 'Final',
      rulePackIdentity: BR60S_FINAL.rulePackIdentity ?? null,
    });
    await expect(handlers.updateEvent({ id: 'missing', name: 'x', eventType: 'BR60S' })).rejects.toThrow(
      new Error('Event not found: missing'),
    );
  });

  it('reads participants and assignments and deletes an event with both', async () => {
    const championshipId = await createChampionship();
    const eventId = await handlers.createEvent({ championshipId, name: 'Qualification', eventType: 'BR60S' });
    const saved = await handlers.saveParticipants({
      eventId,
      participants: [
        { playerName: 'Aiko Sato', affiliation: 'Japan', familyName: 'Sato', startNumber: '101', gender: 'F' },
        { playerName: 'Mei Ito', affiliation: 'Japan' },
      ],
    });
    const [first, second] = saved.participants;
    await handlers.saveFiringPointAssignments({
      eventId,
      assignments: [
        { relayNumber: 1, firingPointNumber: 3, participantId: first!.id },
        { relayNumber: 1, firingPointNumber: 4, participantId: second!.id },
      ],
    });

    expect(await handlers.getParticipants({ eventId })).toEqual(saved);
    expect(saved.participants[0]).toMatchObject({
      playerName: 'Aiko Sato',
      familyName: 'Sato',
      sortOrder: 0,
      startNumber: '101',
      gender: 'F',
    });
    expect(saved.participants[1]).toMatchObject({ familyName: 'Mei Ito', sortOrder: 1 });
    expect(await handlers.getFiringPointAssignments({ eventId })).toEqual({
      assignments: [
        { id: expect.any(String), relayNumber: 1, firingPointNumber: 3, participantId: first!.id },
        { id: expect.any(String), relayNumber: 1, firingPointNumber: 4, participantId: second!.id },
      ],
    });

    await handlers.deleteEvent({ id: eventId });
    expect((await handlers.getDetail({ id: championshipId }))?.events).toEqual([]);
    expect(await handlers.getParticipants({ eventId })).toEqual({ participants: [] });
    expect(await handlers.getFiringPointAssignments({ eventId })).toEqual({ assignments: [] });
  });

  it('lists the registered competition types', async () => {
    expect(await handlers.getCompetitionTypes()).toEqual({
      types: [BR60S, BR60S_FINAL, AR60].map((definition) => ({
        id: definition.id,
        name: definition.name,
        scoringPrecision: definition.scoring.precision,
        totalSeries: definition.resultFormat.totalSeries,
        rulePackId: definition.rulePackId ?? null,
      })),
    });
  });
});
