// SPDX-License-Identifier: MIT
import { Round } from '@/main/modules/lane-control';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
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
} from '@/shared/ipc/contracts';

import { Championship } from '../domain/Championship';
import { ChampionshipId } from '../domain/ChampionshipId';
import { ChampionshipInfo } from '../domain/ChampionshipInfo';
import { Event } from '../domain/Event';
import { EventId } from '../domain/EventId';
import { EventType } from '../domain/EventType';
import { FiringPointAssignment } from '../domain/FiringPointAssignment';
import type { IChampionshipRepository } from '../domain/IChampionshipRepository';
import type { IEventRepository } from '../domain/IEventRepository';
import type { IFiringPointAssignmentRepository } from '../domain/IFiringPointAssignmentRepository';
import type { IParticipantRepository } from '../domain/IParticipantRepository';
import { Participant } from '../domain/Participant';
import { ParticipantId } from '../domain/ParticipantId';
import type { GetEventByIdResponse, RelayFiringPointAssignment } from './championshipQueries';

/** Tells whether any qualification, Final or Mixed Team Final result is stored for an event. */
export interface IEventResultPresence {
  hasStoredResults(eventId: string): boolean;
}

export interface ChampionshipServiceDependencies {
  readonly championships: IChampionshipRepository;
  readonly events: IEventRepository;
  readonly participants: IParticipantRepository;
  readonly assignments: IFiringPointAssignmentRepository;
  readonly competitionTypes: CompetitionTypeRegistry;
  readonly results: IEventResultPresence;
}

/** Championship, event, participant and firing-point assignment use cases behind the championship IPC API. */
export class ChampionshipService {
  private readonly championships: IChampionshipRepository;
  private readonly events: IEventRepository;
  private readonly participants: IParticipantRepository;
  private readonly assignments: IFiringPointAssignmentRepository;
  private readonly competitionTypes: CompetitionTypeRegistry;
  private readonly results: IEventResultPresence;

  constructor(dependencies: ChampionshipServiceDependencies) {
    this.championships = dependencies.championships;
    this.events = dependencies.events;
    this.participants = dependencies.participants;
    this.assignments = dependencies.assignments;
    this.competitionTypes = dependencies.competitionTypes;
    this.results = dependencies.results;
  }

  // --- Commands ---

  createChampionship(input: CreateChampionshipPayload): string {
    const id = ChampionshipId.generate();
    const info = ChampionshipInfo.create(input.name, input.date, input.venue);
    const championship = Championship.create(id, info);
    this.championships.save(championship);
    return id.value;
  }

  updateChampionship(input: UpdateChampionshipPayload): void {
    const championship = this.championships.findById(input.id);
    if (!championship) {
      throw new Error(`Championship not found: ${input.id}`);
    }
    const info = ChampionshipInfo.create(
      input.name ?? championship.info.name,
      input.date ?? championship.info.date,
      input.venue ?? championship.info.venue,
    );
    const updated = championship.updateInfo(info);
    this.championships.update(updated);
  }

  deleteChampionship(input: DeleteChampionshipPayload): void {
    this.championships.delete(input.id);
  }

  createEvent(input: CreateEventPayload): string {
    const id = EventId.generate();
    const championshipId = ChampionshipId.create(input.championshipId);
    const eventType = EventType.create(input.eventType, this.competitionTypes);
    const def = this.competitionTypes.get(input.eventType);
    const round = Round.create(def.config.name);
    const existingEvents = this.events.findByChampionshipId(input.championshipId);
    const sortOrder = existingEvents.length;
    const event = Event.create(
      id,
      championshipId,
      input.name,
      eventType,
      round,
      sortOrder,
      def.rulePackIdentity ?? null,
    );
    this.events.save(event);
    return id.value;
  }

  updateEvent(input: UpdateEventPayload): void {
    const event = this.events.findById(input.id);
    if (!event) {
      throw new Error(`Event not found: ${input.id}`);
    }
    const eventType = EventType.create(input.eventType, this.competitionTypes);
    if (!event.eventType.equals(eventType) && this.results.hasStoredResults(input.id)) {
      throw new Error('Cannot change the type of an event with saved results; only its name can be changed');
    }
    const def = this.competitionTypes.get(input.eventType);
    const round = Round.create(def.config.name);
    const updated = event.update(
      input.name,
      eventType,
      round,
      event.eventType.equals(eventType) ? event.rulePackIdentity : (def.rulePackIdentity ?? null),
    );
    this.events.update(updated);
  }

  deleteEvent(input: DeleteEventPayload): void {
    this.events.transaction(() => {
      this.assignments.deleteByEventId(input.id);
      this.participants.deleteByEventId(input.id);
      this.events.delete(input.id);
    });
  }

  saveParticipants(input: SaveParticipantsPayload): ParticipantListResponse {
    const eventId = EventId.create(input.eventId);

    const existing = this.participants.findByEventId(input.eventId);
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
        return mergeParticipant(existingById.get(p.id)!, p, index);
      } else {
        const newId = ParticipantId.generate();
        usedIds.add(newId.value);
        return Participant.create(
          newId,
          eventId,
          p.playerName,
          p.affiliation,
          p.logoPath ?? null,
          index,
          p.familyName ?? p.playerName,
          {
            startNumber: p.startNumber,
            issfId: p.issfId,
            nationCode: p.nationCode,
            gender: p.gender,
            entryStatus: p.entryStatus,
            teamId: p.teamId,
            teamName: p.teamName,
          },
        );
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

    this.participants.transaction(() => {
      for (const p of toDelete) {
        this.participants.delete(p.id.value);
      }
      this.participants.saveAll(newParticipants);
    });

    return { participants: newParticipants.map(toParticipantDto) };
  }

  saveFiringPointAssignments(input: SaveFiringPointAssignmentsPayload): FiringPointAssignmentListResponse {
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

    const assignments = FiringPointAssignment.planFor(EventId.create(input.eventId), input.assignments);
    this.assignments.replaceByEventId(input.eventId, assignments);
    return { assignments: assignments.map(toAssignmentDto) };
  }

  // --- Queries ---

  listChampionships(): ChampionshipListResponse {
    const championships = this.championships.findAll();
    return { championships: championships.map(toChampionshipSummary) };
  }

  getDetail(id: string): ChampionshipDetailDto | null {
    const championship = this.championships.findById(id);
    if (!championship) return null;

    const events = this.events.findByChampionshipId(id);
    return { ...toChampionshipSummary(championship), events: events.map(toEventDto) };
  }

  getParticipants(eventId: string): ParticipantListResponse {
    const participants = this.participants.findByEventId(eventId);
    return { participants: participants.map(toParticipantDto) };
  }

  getFiringPointAssignments(eventId: string): FiringPointAssignmentListResponse {
    const assignments = this.assignments.findByEventId(eventId);
    return { assignments: assignments.map(toAssignmentDto) };
  }

  listCompetitionTypes(): CompetitionTypeListResponse {
    const all = this.competitionTypes.getAll();
    return {
      types: all.map((def) => ({
        id: def.id,
        name: def.name,
        scoringPrecision: def.scoring.precision,
        totalSeries: def.resultFormat.totalSeries,
        rulePackId: def.rulePackId ?? null,
      })),
    };
  }

  findEvent(eventId: string): GetEventByIdResponse | null {
    const event = this.events.findById(eventId);
    return event ? toEventDto(event) : null;
  }

  getRelayAssignments(eventId: string, relayNumber: number): RelayFiringPointAssignment[] {
    const participantsById = new Map(
      this.participants.findByEventId(eventId).map((participant) => [participant.id.value, participant]),
    );
    return this.assignments.findByEventIdAndRelay(eventId, relayNumber).map((assignment) => {
      const participant = participantsById.get(assignment.participantId.value);
      if (!participant) {
        throw new Error(`Firing-point assignment references missing participant ${assignment.participantId.value}`);
      }
      return {
        firingPointNumber: assignment.firingPointNumber,
        participantId: participant.id.value,
        playerName: participant.playerName,
        familyName: participant.familyName,
        affiliation: participant.affiliation,
      };
    });
  }
}

type ParticipantInput = SaveParticipantsPayload['participants'][number];

/** Applies a saved row to an existing participant; omitted fields keep their stored values. */
function mergeParticipant(existing: Participant, input: ParticipantInput, sortOrder: number): Participant {
  const entry = existing.officialEntry;
  return Participant.create(
    existing.id,
    existing.eventId,
    input.playerName,
    input.affiliation,
    input.logoPath ?? existing.logoPath,
    sortOrder,
    input.familyName ?? existing.familyName,
    {
      startNumber: input.startNumber === undefined ? entry.startNumber : input.startNumber,
      issfId: input.issfId === undefined ? entry.issfId : input.issfId,
      nationCode: input.nationCode === undefined ? entry.nationCode : input.nationCode,
      gender: input.gender ?? entry.gender,
      entryStatus: input.entryStatus ?? entry.entryStatus,
      teamId: input.teamId === undefined ? entry.teamId : input.teamId,
      teamName:
        input.teamId === null && input.teamName === undefined
          ? null
          : input.teamName === undefined
            ? entry.teamName
            : input.teamName,
    },
  );
}

function toChampionshipSummary(championship: Championship): ChampionshipListResponse['championships'][number] {
  return {
    id: championship.id.value,
    name: championship.info.name,
    date: championship.info.date,
    venue: championship.info.venue,
    createdAt: championship.createdAt.toISOString(),
  };
}

/** The event fields shared by the championship detail and the event lookup. */
function toEventDto(event: Event) {
  return {
    id: event.id.value,
    name: event.name,
    eventType: event.eventType.value,
    round: event.round.value,
    sortOrder: event.sortOrder,
    rulePackIdentity: event.rulePackIdentity,
  };
}

function toParticipantDto(participant: Participant): ParticipantListResponse['participants'][number] {
  return {
    id: participant.id.value,
    playerName: participant.playerName,
    familyName: participant.familyName,
    affiliation: participant.affiliation,
    logoPath: participant.logoPath,
    sortOrder: participant.sortOrder,
    ...participant.officialEntry,
  };
}

function toAssignmentDto(assignment: FiringPointAssignment): FiringPointAssignmentListResponse['assignments'][number] {
  return {
    id: assignment.id.value,
    relayNumber: assignment.relayNumber,
    firingPointNumber: assignment.firingPointNumber,
    participantId: assignment.participantId.value,
  };
}
