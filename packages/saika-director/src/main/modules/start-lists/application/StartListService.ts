import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import { SqliteFiringPointAssignmentRepository, SqliteParticipantRepository } from '@/main/modules/championship';
import type {
  CreateStartListVersionPayload,
  DistributeStartListPayload,
  StartListApprovalPayload,
  StartListDistributionChannelDto,
  StartListEntryDto,
  StartListVersionDto,
} from '@/shared/ipc/contracts';

import type {
  IStartListRepository,
  StartListEntryRecord,
  StartListEntryType,
  StartListSnapshot,
  StartListVersionRecord,
} from '../domain/IStartListRepository';
import { assessStartListRows, assertDistributionCoverage } from '../domain/StartListPolicy';

type StartListStatus = StartListVersionDto['status'];

export class StartListService {
  private readonly participants;
  private readonly assignments;

  constructor(
    private readonly database: Database.Database,
    private readonly repository: IStartListRepository,
  ) {
    this.participants = new SqliteParticipantRepository(database);
    this.assignments = new SqliteFiringPointAssignmentRepository(database);
  }

  list(eventId: string): StartListVersionDto[] {
    return this.projectEvent(this.repository.findByEvent(eventId), eventId);
  }

  createVersion(input: CreateStartListVersionPayload): StartListVersionDto {
    const scheduledStartAt = validIso(input.scheduledStartAt, 'scheduledStartAt');
    const publicationDueAt = validIso(input.publicationDueAt, 'publicationDueAt');
    if (Date.parse(publicationDueAt) > Date.parse(scheduledStartAt)) {
      throw new Error('The Start List publication deadline cannot be after the scheduled event start');
    }
    const snapshot = this.buildSnapshot(input.eventId);
    if (snapshot.rows.length === 0) throw new Error('A Start List cannot be created without participants');
    const sourceSnapshotJson = canonicalJson(snapshot);
    const createdAt = validIso(input.createdAt ?? new Date().toISOString(), 'createdAt');
    let id = '';
    this.database.transaction(() => {
      id = crypto.randomUUID();
      this.repository.appendVersion({
        id,
        eventId: input.eventId,
        versionNumber: this.repository.nextVersionNumber(input.eventId, input.listKind),
        listKind: input.listKind,
        disciplineGroup: input.disciplineGroup,
        distributionMode: input.distributionMode,
        scheduledStartAt,
        publicationDueAt,
        sourceSnapshotJson,
        sourceHash: sha256(sourceSnapshotJson),
        snapshot,
        findings: assessStartListRows(snapshot.rows),
        createdBy: requiredText(input.createdBy, 'createdBy'),
        createdAt,
      });
    })();
    return this.projectOne(id, input.eventId);
  }

  approveContent(input: StartListApprovalPayload): StartListVersionDto {
    const value = this.requireVersion(input.versionId);
    this.assertDraftUsable(value);
    if (findEntry(value, 'CONTENT_APPROVED')) throw new Error('This Start List version is already content-approved');
    if (value.findings.some((finding) => finding.severity === 'BLOCKING')) {
      throw new Error('Resolve all blocking Start List findings and create a new version before approval');
    }
    this.repository.appendEntry(this.newEntry(value.id, 'CONTENT_APPROVED', input));
    return this.projectOne(value.id, value.eventId);
  }

  approvePaperless(input: StartListApprovalPayload): StartListVersionDto {
    const value = this.requireVersion(input.versionId);
    this.assertDraftUsable(value);
    if (value.distributionMode !== 'PAPERLESS') throw new Error('This Start List version uses printed distribution');
    if (!findEntry(value, 'CONTENT_APPROVED'))
      throw new Error('Content approval is required before paperless approval');
    if (findEntry(value, 'PAPERLESS_APPROVED')) throw new Error('Paperless distribution is already approved');
    if (input.officialRole !== 'TECHNICAL_DELEGATE') {
      throw new Error('Paperless distribution must be approved by the Technical Delegate');
    }
    this.repository.appendEntry(this.newEntry(value.id, 'PAPERLESS_APPROVED', input));
    return this.projectOne(value.id, value.eventId);
  }

  distribute(input: DistributeStartListPayload): StartListVersionDto {
    const value = this.requireVersion(input.versionId);
    this.assertDraftUsable(value);
    if (!findEntry(value, 'CONTENT_APPROVED')) throw new Error('Content approval is required before distribution');
    if (value.distributionMode === 'PAPERLESS' && !findEntry(value, 'PAPERLESS_APPROVED')) {
      throw new Error('Technical Delegate paperless approval is required before distribution');
    }
    if (value.listKind === 'FINAL' && !input.finalReleaseBasis) {
      throw new Error('A Final Start List requires the protest release basis');
    }
    assertDistributionCoverage(value.distributionMode, input.channels);
    this.repository.appendEntry(
      this.newEntry(value.id, 'DISTRIBUTED', input, input.channels, input.finalReleaseBasis ?? null),
    );
    return this.projectOne(value.id, value.eventId);
  }

  voidVersion(input: StartListApprovalPayload): StartListVersionDto {
    const value = this.requireVersion(input.versionId);
    const status = statusOf(value);
    if (status === 'VOID') return this.projectOne(value.id, value.eventId);
    if (status === 'DISTRIBUTED' || status === 'WITHDRAWN') {
      throw new Error('A distributed Start List must be withdrawn, not voided');
    }
    this.repository.appendEntry(this.newEntry(value.id, 'VOID', input));
    return this.projectOne(value.id, value.eventId);
  }

  withdrawDistribution(input: StartListApprovalPayload): StartListVersionDto {
    const value = this.requireVersion(input.versionId);
    if (statusOf(value) !== 'DISTRIBUTED') throw new Error('Only a distributed Start List can be withdrawn');
    this.repository.appendEntry(this.newEntry(value.id, 'WITHDRAWN', input));
    return this.projectOne(value.id, value.eventId);
  }

  private assertDraftUsable(value: StartListVersionRecord): void {
    const status = statusOf(value);
    if (status === 'VOID' || status === 'WITHDRAWN')
      throw new Error(`A ${status.toLowerCase()} Start List cannot be changed`);
    if (!integrityValid(value)) throw new Error('The stored Start List snapshot failed its integrity check');
    if (this.liveSourceHash(value.eventId) !== value.sourceHash) {
      throw new Error('Participants, event data, or firing-point assignments changed; create a new Start List version');
    }
  }

  private newEntry(
    versionId: string,
    type: StartListEntryType,
    input: StartListApprovalPayload,
    channels: readonly StartListDistributionChannelDto[] = [],
    finalReleaseBasis: StartListEntryRecord['finalReleaseBasis'] = null,
  ): StartListEntryRecord {
    return {
      id: crypto.randomUUID(),
      versionId,
      type,
      officialName: requiredText(input.officialName, 'officialName'),
      officialRole: input.officialRole,
      statement: requiredText(input.statement, 'statement'),
      channels: [...channels],
      finalReleaseBasis,
      recordedAt: validIso(input.recordedAt ?? new Date().toISOString(), 'recordedAt'),
    };
  }

  private requireVersion(id: string): StartListVersionRecord {
    const value = this.repository.findById(id);
    if (!value) throw new Error(`Start List version not found: ${id}`);
    return value;
  }

  private projectOne(id: string, eventId: string): StartListVersionDto {
    const value = this.projectEvent(this.repository.findByEvent(eventId), eventId).find(
      (candidate) => candidate.id === id,
    );
    if (!value) throw new Error(`Start List version not found after persistence: ${id}`);
    return value;
  }

  private projectEvent(records: readonly StartListVersionRecord[], eventId: string): StartListVersionDto[] {
    let liveHash: string | null = null;
    try {
      liveHash = this.liveSourceHash(eventId);
    } catch {
      liveHash = null;
    }
    const currentByKind = new Map<string, number>();
    for (const value of records) {
      if (statusOf(value) !== 'DISTRIBUTED') continue;
      currentByKind.set(value.listKind, Math.max(currentByKind.get(value.listKind) ?? 0, value.versionNumber));
    }
    return records.map((value) =>
      this.toDto(value, liveHash, currentByKind.get(value.listKind) === value.versionNumber),
    );
  }

  private toDto(value: StartListVersionRecord, liveHash: string | null, isCurrent: boolean): StartListVersionDto {
    const contentApproval = findEntry(value, 'CONTENT_APPROVED');
    const paperlessApproval = findEntry(value, 'PAPERLESS_APPROVED');
    const distributions = value.entries.filter((entry) => entry.type === 'DISTRIBUTED');
    const voidEntry = findEntry(value, 'VOID');
    const withdrawalEntry = findEntry(value, 'WITHDRAWN');
    const firstDistribution = distributions[0] ?? null;
    return {
      id: value.id,
      eventId: value.eventId,
      versionNumber: value.versionNumber,
      listKind: value.listKind,
      disciplineGroup: value.disciplineGroup,
      distributionMode: value.distributionMode,
      eventNameSnapshot: value.snapshot.eventName,
      competitionTypeIdSnapshot: value.snapshot.competitionTypeId,
      scheduledStartAt: value.scheduledStartAt,
      publicationDueAt: value.publicationDueAt,
      substitutionDeadlineAt: new Date(Date.parse(value.scheduledStartAt) - 60 * 60_000).toISOString(),
      sourceHash: value.sourceHash,
      rows: value.snapshot.rows,
      findings: value.findings,
      createdBy: value.createdBy,
      createdAt: value.createdAt,
      status: statusOf(value),
      contentApproval: toEntryDto(contentApproval),
      paperlessApproval: toEntryDto(paperlessApproval),
      distributions: distributions.map(toEntryDtoRequired),
      voidEntry: toEntryDto(voidEntry),
      withdrawalEntry: toEntryDto(withdrawalEntry),
      distributedChannels: [...new Set(distributions.flatMap((entry) => entry.channels))],
      deadlineStatus: firstDistribution
        ? Date.parse(firstDistribution.recordedAt) <= Date.parse(value.publicationDueAt)
          ? 'ON_TIME'
          : 'LATE'
        : 'PENDING',
      stale: liveHash !== value.sourceHash,
      integrityValid: integrityValid(value),
      isCurrent,
    };
  }

  private liveSourceHash(eventId: string): string {
    return sha256(canonicalJson(this.buildSnapshot(eventId)));
  }

  private buildSnapshot(eventId: string): StartListSnapshot {
    const event = this.database.prepare('SELECT name, event_type FROM events WHERE id = ?').get(eventId) as
      { name: string; event_type: string } | undefined;
    if (!event) throw new Error(`Event not found: ${eventId}`);
    const assignmentsByParticipant = new Map(
      this.assignments.findByEventId(eventId).map((assignment) => [assignment.participantId.value, assignment]),
    );
    const rows = this.participants
      .findByEventId(eventId)
      .map((participant) => {
        const assignment = assignmentsByParticipant.get(participant.id.value);
        return {
          participantId: participant.id.value,
          startNumber: participant.officialEntry.startNumber,
          issfId: participant.officialEntry.issfId,
          athleteName: participant.playerName,
          familyName: participant.familyName,
          affiliation: participant.affiliation,
          nationCode: participant.officialEntry.nationCode,
          gender: participant.officialEntry.gender,
          entryStatus: participant.officialEntry.entryStatus,
          teamId: participant.officialEntry.teamId,
          teamName: participant.officialEntry.teamName,
          relayNumber: assignment?.relayNumber ?? null,
          firingPointNumber: assignment?.firingPointNumber ?? null,
        };
      })
      .sort(compareRows);
    return { eventName: event.name, competitionTypeId: event.event_type, rows };
  }
}

function statusOf(value: StartListVersionRecord): StartListStatus {
  if (findEntry(value, 'VOID')) return 'VOID';
  if (findEntry(value, 'WITHDRAWN')) return 'WITHDRAWN';
  if (findEntry(value, 'DISTRIBUTED')) return 'DISTRIBUTED';
  if (findEntry(value, 'CONTENT_APPROVED')) return 'APPROVED';
  return 'DRAFT';
}

function findEntry(value: StartListVersionRecord, type: StartListEntryType): StartListEntryRecord | null {
  return value.entries.find((entry) => entry.type === type) ?? null;
}

function integrityValid(value: StartListVersionRecord): boolean {
  return (
    sha256(value.sourceSnapshotJson) === value.sourceHash && canonicalJson(value.snapshot) === value.sourceSnapshotJson
  );
}

function toEntryDto(value: StartListEntryRecord | null): StartListEntryDto | null {
  return value ? toEntryDtoRequired(value) : null;
}

function toEntryDtoRequired(value: StartListEntryRecord): StartListEntryDto {
  return { ...value, channels: [...value.channels] };
}

function compareRows(left: StartListSnapshot['rows'][number], right: StartListSnapshot['rows'][number]): number {
  return (
    (left.relayNumber ?? Number.MAX_SAFE_INTEGER) - (right.relayNumber ?? Number.MAX_SAFE_INTEGER) ||
    (left.firingPointNumber ?? Number.MAX_SAFE_INTEGER) - (right.firingPointNumber ?? Number.MAX_SAFE_INTEGER) ||
    left.participantId.localeCompare(right.participantId)
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function validIso(value: string, name: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${name} must be a valid date-time`);
  return parsed.toISOString();
}
