import { createHash } from 'node:crypto';
import {
  EventId,
  FiringPointAssignment,
  type IEventSummaryReader,
  type IFiringPointAssignmentRepository,
  type IParticipantRepository,
} from '@/main/modules/championship';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { CreateSquaddingDrawPayload, SquaddingDrawDto, SquaddingDrawEntryPayload } from '@/shared/ipc/contracts';

import type {
  ISquaddingRepository,
  SquaddingDrawEntryRecord,
  SquaddingDrawRecord,
} from '../domain/ISquaddingRepository';
import { IssfSquaddingPolicy, SQUADDING_ALGORITHM_VERSION } from '../domain/SquaddingPolicy';
import { sha256Json } from '@/main/domain/sha256Json';

/** The championship data a draw reads, and the assignments an applied draw replaces. */
export interface SquaddingSources {
  readonly events: IEventSummaryReader;
  readonly participants: Pick<IParticipantRepository, 'findByEventId'>;
  readonly assignments: Pick<IFiringPointAssignmentRepository, 'replaceByEventId'>;
}

export class SquaddingService {
  constructor(
    private readonly repository: ISquaddingRepository,
    private readonly sources: SquaddingSources,
    private readonly competitionTypes: CompetitionTypeRegistry,
    private readonly policy = new IssfSquaddingPolicy(),
  ) {}

  list(eventId: string): SquaddingDrawDto[] {
    return this.repository.findByEvent(eventId).map((draw) => this.toDto(draw));
  }

  createDraw(input: CreateSquaddingDrawPayload): SquaddingDrawDto {
    const eventType = this.requireEventType(input.eventId);
    if (eventType !== input.competitionTypeId) {
      throw new Error(`Event uses ${eventType}, not ${input.competitionTypeId}`);
    }
    const definition = this.competitionTypes.get(eventType);
    const snapshot = this.participantSnapshot(input.eventId);
    const result = this.policy.draw({
      participants: snapshot,
      seed: input.seed,
      relayCount: input.relayCount,
      firstFiringPoint: input.firstFiringPoint,
      firingPointCount: input.firingPointCount,
      statusSectionPolicy: input.statusSectionPolicy,
      round:
        definition.config.name === 'Final'
          ? 'Final'
          : definition.config.name === 'Elimination'
            ? 'Elimination'
            : 'Qualification',
      ...(definition.teamFormat === 'MIXED_PAIR' ? { teamFormat: 'MIXED_PAIR' as const } : {}),
    });
    const participantSnapshotJson = JSON.stringify(snapshot);
    const assignmentsJson = JSON.stringify(result.assignments);
    const draw = {
      id: crypto.randomUUID(),
      eventId: input.eventId,
      competitionTypeId: eventType,
      seed: input.seed,
      algorithmVersion: SQUADDING_ALGORITHM_VERSION,
      relayCount: input.relayCount,
      firstFiringPoint: input.firstFiringPoint,
      firingPointCount: input.firingPointCount,
      statusSectionPolicy: input.statusSectionPolicy,
      participantSnapshotJson,
      participantSnapshotHash: sha256(participantSnapshotJson),
      assignments: result.assignments,
      outputHash: sha256(assignmentsJson),
      findings: result.findings,
      createdBy: input.createdBy.trim(),
      createdAt: input.createdAt ?? new Date().toISOString(),
    } satisfies Omit<SquaddingDrawRecord, 'entries'>;
    this.repository.appendDraw(draw);
    return this.toDto(this.requireDraw(draw.id));
  }

  approve(input: SquaddingDrawEntryPayload): SquaddingDrawDto {
    const draw = this.requireDraw(input.drawId);
    if (entry(draw, 'VOID')) throw new Error('A voided draw cannot be approved');
    if (entry(draw, 'APPROVED')) throw new Error('This draw already has Technical Delegate approval');
    if (this.isStale(draw)) throw new Error('The participant entry data changed after this draw was created');
    this.repository.appendEntry(this.newEntry(draw.id, 'APPROVED', input));
    return this.toDto(this.requireDraw(draw.id));
  }

  apply(input: SquaddingDrawEntryPayload): SquaddingDrawDto {
    const draw = this.requireDraw(input.drawId);
    if (entry(draw, 'VOID')) throw new Error('A voided draw cannot be applied');
    if (!entry(draw, 'APPROVED')) throw new Error('Technical Delegate approval is required before applying a draw');
    if (entry(draw, 'APPLIED')) throw new Error('This draw has already been applied');
    if (this.isStale(draw)) throw new Error('The participant entry data changed after this draw was created');
    if (this.requireEventType(draw.eventId) !== draw.competitionTypeId) {
      throw new Error('The event competition type changed after this draw was created');
    }
    if (sha256Json(draw.assignments) !== draw.outputHash) {
      throw new Error('The stored squadding output failed its integrity check');
    }

    const entities = FiringPointAssignment.planFor(EventId.create(draw.eventId), draw.assignments);
    const applicationEntry = this.newEntry(draw.id, 'APPLIED', input);
    this.repository.transaction(() => {
      this.sources.assignments.replaceByEventId(draw.eventId, entities);
      this.repository.appendEntry(applicationEntry);
    });
    return this.toDto(this.requireDraw(draw.id));
  }

  voidDraw(input: SquaddingDrawEntryPayload): SquaddingDrawDto {
    const draw = this.requireDraw(input.drawId);
    if (entry(draw, 'VOID')) return this.toDto(draw);
    if (entry(draw, 'APPLIED')) throw new Error('An applied draw cannot be voided');
    this.repository.appendEntry(this.newEntry(draw.id, 'VOID', input));
    return this.toDto(this.requireDraw(draw.id));
  }

  private newEntry(
    drawId: string,
    entryType: SquaddingDrawEntryRecord['entryType'],
    input: SquaddingDrawEntryPayload,
  ): SquaddingDrawEntryRecord {
    return {
      id: crypto.randomUUID(),
      drawId,
      entryType,
      officialName: input.officialName.trim(),
      statement: input.statement.trim(),
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    };
  }

  private toDto(draw: SquaddingDrawRecord): SquaddingDrawDto {
    return {
      id: draw.id,
      eventId: draw.eventId,
      competitionTypeId: draw.competitionTypeId,
      seed: draw.seed,
      algorithmVersion: draw.algorithmVersion,
      relayCount: draw.relayCount,
      firstFiringPoint: draw.firstFiringPoint,
      firingPointCount: draw.firingPointCount,
      statusSectionPolicy: draw.statusSectionPolicy,
      participantSnapshotHash: draw.participantSnapshotHash,
      outputHash: draw.outputHash,
      assignments: draw.assignments,
      findings: draw.findings,
      createdBy: draw.createdBy,
      createdAt: draw.createdAt,
      approval: toLedgerEntry(entry(draw, 'APPROVED')),
      application: toLedgerEntry(entry(draw, 'APPLIED')),
      voidEntry: toLedgerEntry(entry(draw, 'VOID')),
      stale: this.isStale(draw),
    };
  }

  private requireDraw(id: string): SquaddingDrawRecord {
    const draw = this.repository.findById(id);
    if (!draw) throw new Error(`Squadding draw not found: ${id}`);
    return draw;
  }

  private requireEventType(eventId: string): string {
    const event = this.sources.events.findSummary(eventId);
    if (!event) throw new Error(`Event not found: ${eventId}`);
    return event.eventType;
  }

  private participantSnapshot(eventId: string) {
    return this.sources.participants
      .findByEventId(eventId)
      .map((participant) => ({
        id: participant.id.value,
        nationCode: participant.officialEntry.nationCode,
        gender: participant.officialEntry.gender,
        entryStatus: participant.officialEntry.entryStatus,
        teamId: participant.officialEntry.teamId,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private isStale(draw: SquaddingDrawRecord): boolean {
    try {
      return sha256Json(this.participantSnapshot(draw.eventId)) !== draw.participantSnapshotHash;
    } catch {
      return true;
    }
  }
}

function entry(draw: SquaddingDrawRecord, type: SquaddingDrawEntryRecord['entryType']) {
  return draw.entries.find((candidate) => candidate.entryType === type) ?? null;
}

function toLedgerEntry(value: SquaddingDrawEntryRecord | null) {
  if (!value) return null;
  return {
    id: value.id,
    officialName: value.officialName,
    statement: value.statement,
    recordedAt: value.recordedAt,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
