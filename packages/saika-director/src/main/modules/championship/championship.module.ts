/**
 * Championship Module Registration
 *
 * Registers all championship-related IPC handlers with inline logic.
 * Repositories are created internally. Command/query handlers are inlined
 * directly into IPC handler callbacks.
 */
import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { defineQuery } from '@/main/shared-infra/cqrs/QueryBus';
import type Database from 'better-sqlite3';

// Repositories
import { SqliteChampionshipRepository } from './infra/SqliteChampionshipRepository';
import { SqliteEventRepository } from './infra/SqliteEventRepository';
import { SqliteParticipantRepository } from './infra/SqliteParticipantRepository';
import { SqliteFiringPointAssignmentRepository } from './infra/SqliteFiringPointAssignmentRepository';

// Domain
import { Championship } from './domain/Championship';
import { ChampionshipId } from './domain/ChampionshipId';
import { ChampionshipInfo } from './domain/ChampionshipInfo';
import { Event } from './domain/Event';
import { EventId } from './domain/EventId';
import { EventType } from './domain/EventType';
import { Participant } from './domain/Participant';
import { ParticipantId } from './domain/ParticipantId';
import { FiringPointAssignment } from './domain/FiringPointAssignment';
import { FiringPointAssignmentId } from './domain/FiringPointAssignmentId';
import { Round } from '@/main/modules/lane-control';

// IPC Contract
import { championshipContract } from '@/shared/ipc/contracts';

// Response types
import type {
  ChampionshipListResponse,
  ChampionshipDetailResponse,
  ParticipantListResponse,
  FiringPointAssignmentListResponse,
  CompetitionTypeListResponse,
} from '@/shared/ipc/contracts/championship.contract';

// ---------------------------------------------------------------------------
// Cross-module query token: GetEventById
// Used by board module and results commands via QueryBus.
// ---------------------------------------------------------------------------
export interface GetEventByIdQuery {
  eventId: string;
}

export interface GetEventByIdResponse {
  id: string;
  name: string;
  eventType: string;
  round: string;
  sortOrder: number;
}

export const GetEventByIdToken = defineQuery<GetEventByIdQuery, GetEventByIdResponse | null>('GetEventById');

export interface GetFiringPointAssignmentsByRelayQuery {
  eventId: string;
  relayNumber: number;
}

export interface RelayFiringPointAssignment {
  firingPointNumber: number;
  participantId: string;
  playerName: string;
  affiliation: string;
}

export const GetFiringPointAssignmentsByRelayToken = defineQuery<
  GetFiringPointAssignmentsByRelayQuery,
  RelayFiringPointAssignment[]
>('GetFiringPointAssignmentsByRelay');

function hasStoredResults(database: Database.Database, eventId: string): boolean {
  const row = database
    .prepare(
      `SELECT (
        EXISTS(SELECT 1 FROM results WHERE event_id = @eventId)
        OR EXISTS(SELECT 1 FROM final_results WHERE event_id = @eventId)
      ) AS has_results`,
    )
    .get({ eventId }) as { has_results: number };
  return row.has_results === 1;
}

export const championshipModule: ModuleDefinition<'database' | 'queryBus' | 'ipcRouter' | 'competitionTypeRegistry'> = {
  name: 'championship',
  deps: ['database', 'queryBus', 'ipcRouter', 'competitionTypeRegistry'] as const,
  register(ctx) {
    const { database, queryBus, ipcRouter, competitionTypeRegistry } = ctx;

    // 1. Create repositories internally
    const championshipRepository = new SqliteChampionshipRepository(database);
    const eventRepository = new SqliteEventRepository(database, competitionTypeRegistry);
    const participantRepository = new SqliteParticipantRepository(database);
    const firingPointAssignmentRepository = new SqliteFiringPointAssignmentRepository(database);

    // 2. Register cross-module query on QueryBus (used by board & results modules)
    queryBus.register(GetEventByIdToken, async (query) => {
      const event = eventRepository.findById(query.eventId);
      if (!event) return null;
      return {
        id: event.id.value,
        name: event.name,
        eventType: event.eventType.value,
        round: event.round.value,
        sortOrder: event.sortOrder,
      };
    });
    queryBus.register(GetFiringPointAssignmentsByRelayToken, async (query) => {
      const participantsById = new Map(
        participantRepository.findByEventId(query.eventId).map((participant) => [participant.id.value, participant]),
      );
      return firingPointAssignmentRepository
        .findByEventIdAndRelay(query.eventId, query.relayNumber)
        .map((assignment) => {
          const participant = participantsById.get(assignment.participantId.value);
          if (!participant) {
            throw new Error(`Firing-point assignment references missing participant ${assignment.participantId.value}`);
          }
          return {
            firingPointNumber: assignment.firingPointNumber,
            participantId: participant.id.value,
            playerName: participant.playerName,
            affiliation: participant.affiliation,
          };
        });
    });

    // 3. IPC Registration — all handlers inlined
    ipcRouter.register(championshipContract, {
      // --- Commands ---

      create: async (input) => {
        const id = ChampionshipId.generate();
        const info = ChampionshipInfo.create(input.name, input.date, input.venue);
        const championship = Championship.create(id, info);
        championshipRepository.save(championship);
        return id.value;
      },

      update: async (input) => {
        const championship = championshipRepository.findById(input.id);
        if (!championship) {
          throw new Error(`Championship not found: ${input.id}`);
        }
        const info = ChampionshipInfo.create(
          input.name ?? championship.info.name,
          input.date ?? championship.info.date,
          input.venue ?? championship.info.venue,
        );
        const updated = championship.updateInfo(info);
        championshipRepository.update(updated);
      },

      delete: async (input) => {
        championshipRepository.delete(input.id);
      },

      createEvent: async (input) => {
        const id = EventId.generate();
        const championshipId = ChampionshipId.create(input.championshipId);
        const eventType = EventType.create(input.eventType, competitionTypeRegistry);
        const def = competitionTypeRegistry.get(input.eventType);
        const round = Round.create(def.config.name);
        const existingEvents = eventRepository.findByChampionshipId(input.championshipId);
        const sortOrder = existingEvents.length;
        const event = Event.create(id, championshipId, input.name, eventType, round, sortOrder);
        eventRepository.save(event);
        return id.value;
      },

      updateEvent: async (input) => {
        const event = eventRepository.findById(input.id);
        if (!event) {
          throw new Error(`Event not found: ${input.id}`);
        }
        const eventType = EventType.create(input.eventType, competitionTypeRegistry);
        if (!event.eventType.equals(eventType) && hasStoredResults(database, input.id)) {
          throw new Error('Cannot change the type of an event with saved results; only its name can be changed');
        }
        const def = competitionTypeRegistry.get(input.eventType);
        const round = Round.create(def.config.name);
        const updated = event.update(input.name, eventType, round);
        eventRepository.update(updated);
      },

      deleteEvent: async (input) => {
        eventRepository.executeInTransaction(() => {
          firingPointAssignmentRepository.deleteByEventId(input.id);
          participantRepository.deleteByEventId(input.id);
          eventRepository.delete(input.id);
        });
      },

      saveParticipants: async (input) => {
        const eventId = EventId.create(input.eventId);

        const existing = participantRepository.findByEventId(input.eventId);
        const existingIds = new Set(existing.map((participant) => participant.id.value));
        const existingById = new Map(existing.map((participant) => [participant.id.value, participant]));
        const requestedIds = new Set<string>();

        for (const participant of input.participants) {
          if (!participant.id) continue;
          if (!existingIds.has(participant.id)) {
            throw new Error(`Participant ${participant.id} does not belong to event ${input.eventId}`);
          }
          if (requestedIds.has(participant.id)) {
            throw new Error(`Input contains duplicate participant ID: ${participant.id}`);
          }
          requestedIds.add(participant.id);
        }

        const usedIds = new Set<string>();
        const newParticipants = input.participants.map((p, index) => {
          if (p.id) {
            usedIds.add(p.id);
            const existingParticipant = existingById.get(p.id)!;
            return Participant.create(
              ParticipantId.create(p.id),
              eventId,
              p.playerName,
              p.affiliation,
              p.logoPath ?? existingParticipant.logoPath,
              index,
            );
          } else {
            const newId = ParticipantId.generate();
            usedIds.add(newId.value);
            return Participant.create(newId, eventId, p.playerName, p.affiliation, p.logoPath ?? null, index);
          }
        });

        const toDelete = existing.filter((p) => !usedIds.has(p.id.value));
        const participantIdsToDelete = input.participantIdsToDelete ?? [];
        const requestedDeletionIds = new Set(participantIdsToDelete);
        const actualDeletionIds = new Set(toDelete.map((participant) => participant.id.value));

        if (
          requestedDeletionIds.size !== participantIdsToDelete.length ||
          requestedDeletionIds.size !== actualDeletionIds.size ||
          [...actualDeletionIds].some((id) => !requestedDeletionIds.has(id))
        ) {
          throw new Error('Participant deletion list does not match the participants omitted from this save');
        }

        participantRepository.executeInTransaction(() => {
          for (const p of toDelete) {
            participantRepository.delete(p.id.value);
          }
          participantRepository.saveAll(newParticipants);
        });

        return {
          participants: newParticipants.map((participant) => ({
            id: participant.id.value,
            playerName: participant.playerName,
            affiliation: participant.affiliation,
            logoPath: participant.logoPath,
            sortOrder: participant.sortOrder,
          })),
        };
      },

      saveFiringPointAssignments: async (input) => {
        const occupiedFiringPoints = new Set<string>();
        const assignedParticipantIds = new Set<string>();
        for (const assignment of input.assignments) {
          const firingPointKey = `${assignment.relayNumber}:${assignment.firingPointNumber}`;
          if (occupiedFiringPoints.has(firingPointKey)) {
            throw new Error(
              `Relay ${assignment.relayNumber} firing point ${assignment.firingPointNumber} is assigned more than once`,
            );
          }
          occupiedFiringPoints.add(firingPointKey);

          if (assignedParticipantIds.has(assignment.participantId)) {
            throw new Error(`Participant ${assignment.participantId} is assigned more than once in this event`);
          }
          assignedParticipantIds.add(assignment.participantId);
        }

        const eventId = EventId.create(input.eventId);
        const assignments = input.assignments.map((a) =>
          FiringPointAssignment.create(
            FiringPointAssignmentId.generate(),
            eventId,
            a.relayNumber,
            a.firingPointNumber,
            ParticipantId.create(a.participantId),
          ),
        );
        firingPointAssignmentRepository.executeInTransaction(() => {
          firingPointAssignmentRepository.deleteByEventId(input.eventId);
          firingPointAssignmentRepository.saveAll(assignments);
        });

        return {
          assignments: assignments.map((assignment) => ({
            id: assignment.id.value,
            relayNumber: assignment.relayNumber,
            firingPointNumber: assignment.firingPointNumber,
            participantId: assignment.participantId.value,
          })),
        };
      },

      // --- Queries ---

      getAll: async (): Promise<ChampionshipListResponse> => {
        const championships = championshipRepository.findAll();
        return {
          championships: championships.map((c) => ({
            id: c.id.value,
            name: c.info.name,
            date: c.info.date,
            venue: c.info.venue,
            createdAt: c.createdAt.toISOString(),
          })),
        };
      },

      getDetail: async (input): Promise<ChampionshipDetailResponse | null> => {
        const championship = championshipRepository.findById(input.id);
        if (!championship) return null;

        const events = eventRepository.findByChampionshipId(input.id);
        return {
          id: championship.id.value,
          name: championship.info.name,
          date: championship.info.date,
          venue: championship.info.venue,
          createdAt: championship.createdAt.toISOString(),
          events: events.map((e) => ({
            id: e.id.value,
            name: e.name,
            eventType: e.eventType.value,
            round: e.round.value,
            sortOrder: e.sortOrder,
          })),
        };
      },

      getParticipants: async (input): Promise<ParticipantListResponse> => {
        const participants = participantRepository.findByEventId(input.eventId);
        return {
          participants: participants.map((p) => ({
            id: p.id.value,
            playerName: p.playerName,
            affiliation: p.affiliation,
            logoPath: p.logoPath,
            sortOrder: p.sortOrder,
          })),
        };
      },

      getFiringPointAssignments: async (input): Promise<FiringPointAssignmentListResponse> => {
        const assignments = firingPointAssignmentRepository.findByEventId(input.eventId);
        return {
          assignments: assignments.map((a) => ({
            id: a.id.value,
            relayNumber: a.relayNumber,
            firingPointNumber: a.firingPointNumber,
            participantId: a.participantId.value,
          })),
        };
      },

      getCompetitionTypes: async (): Promise<CompetitionTypeListResponse> => {
        const all = competitionTypeRegistry.getAll();
        return {
          types: all.map((def) => ({ id: def.id, name: def.name })),
        };
      },
    });
  },
};
