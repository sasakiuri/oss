import type {
  AppendMixedTeamTimeoutPayload,
  MixedTeamTimeoutDto,
  StartMixedTeamTimeoutPayload,
} from '@/shared/ipc/contracts';
import type {
  IMixedTeamTimeoutRepository,
  MixedTeamTimeoutEntryRecord,
  MixedTeamTimeoutRecord,
} from '../domain/IMixedTeamTimeoutRepository';

export class MixedTeamTimeoutService {
  constructor(
    private readonly repository: IMixedTeamTimeoutRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(competitionId: string): Promise<MixedTeamTimeoutDto[]> {
    return this.repository.findByCompetition(competitionId).map((session) => this.toDto(session));
  }

  async start(input: StartMixedTeamTimeoutPayload): Promise<MixedTeamTimeoutDto> {
    if (!isRoundBoundary(input.afterShot)) {
      throw new Error('A Mixed Team timeout must start immediately after a completed Final round');
    }
    const courtesyTeamIds = [...new Set(input.courtesyTeamIds.map((id) => id.trim()))];
    if (courtesyTeamIds.includes(input.requestingTeamId)) {
      throw new Error('The requesting team cannot also be listed as a courtesy team');
    }
    const sessions = this.repository.findByCompetition(input.competitionId);
    if (sessions.some((session) => !isVoid(session) && session.requestingTeamId === input.requestingTeamId)) {
      throw new Error(`Team ${input.requestingTeamId} has already used its one Final timeout`);
    }
    if (sessions.some((session) => this.isActive(session))) {
      throw new Error('Another Mixed Team timeout is currently active');
    }
    const startedAt = input.startedAt ? new Date(input.startedAt) : this.now();
    if (!Number.isFinite(startedAt.getTime())) throw new Error('startedAt is invalid');
    const session = {
      id: crypto.randomUUID(),
      competitionId: input.competitionId,
      requestingTeamId: input.requestingTeamId.trim(),
      courtesyTeamIds,
      requestedByRole: input.requestedByRole,
      requestedByName: input.requestedByName.trim(),
      afterShot: input.afterShot,
      durationSeconds: 30 as const,
      officialName: input.officialName.trim(),
      statement: input.statement.trim(),
      startedAt: startedAt.toISOString(),
      expiresAt: new Date(startedAt.getTime() + 30_000).toISOString(),
    } satisfies Omit<MixedTeamTimeoutRecord, 'entries'>;
    this.repository.appendSession(session);
    return this.toDto(this.require(session.id));
  }

  async close(input: AppendMixedTeamTimeoutPayload): Promise<MixedTeamTimeoutDto> {
    const session = this.require(input.timeoutId);
    if (isVoid(session)) throw new Error('A voided timeout cannot be closed');
    if (entry(session, 'CLOSED')) return this.toDto(session);
    this.repository.appendEntry(this.newEntry(session.id, 'CLOSED', input));
    return this.toDto(this.require(session.id));
  }

  async voidTimeout(input: AppendMixedTeamTimeoutPayload): Promise<MixedTeamTimeoutDto> {
    const session = this.require(input.timeoutId);
    if (isVoid(session)) return this.toDto(session);
    if (entry(session, 'CLOSED')) throw new Error('A closed timeout cannot be voided');
    this.repository.appendEntry(this.newEntry(session.id, 'VOID', input));
    return this.toDto(this.require(session.id));
  }

  private newEntry(
    timeoutId: string,
    entryType: MixedTeamTimeoutEntryRecord['entryType'],
    input: AppendMixedTeamTimeoutPayload,
  ): MixedTeamTimeoutEntryRecord {
    return {
      id: crypto.randomUUID(),
      timeoutId,
      entryType,
      officialName: input.officialName.trim(),
      statement: input.statement.trim(),
      recordedAt: input.recordedAt ?? this.now().toISOString(),
    };
  }

  private require(id: string): MixedTeamTimeoutRecord {
    const session = this.repository.findById(id);
    if (!session) throw new Error(`Mixed Team timeout not found: ${id}`);
    return session;
  }

  private isActive(session: MixedTeamTimeoutRecord): boolean {
    return !isVoid(session) && !entry(session, 'CLOSED') && Date.parse(session.expiresAt) > this.now().getTime();
  }

  private toDto(session: MixedTeamTimeoutRecord): MixedTeamTimeoutDto {
    return {
      id: session.id,
      competitionId: session.competitionId,
      requestingTeamId: session.requestingTeamId,
      courtesyTeamIds: session.courtesyTeamIds,
      requestedByRole: session.requestedByRole,
      requestedByName: session.requestedByName,
      afterShot: session.afterShot,
      durationSeconds: session.durationSeconds,
      officialName: session.officialName,
      statement: session.statement,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      closedEntry: toDtoEntry(entry(session, 'CLOSED')),
      voidEntry: toDtoEntry(entry(session, 'VOID')),
      active: this.isActive(session),
    };
  }
}

function isRoundBoundary(afterShot: number): boolean {
  return (afterShot <= 15 && afterShot % 5 === 0) || (afterShot >= 16 && afterShot <= 24);
}
function entry(session: MixedTeamTimeoutRecord, type: MixedTeamTimeoutEntryRecord['entryType']) {
  return session.entries.find((candidate) => candidate.entryType === type) ?? null;
}
function isVoid(session: MixedTeamTimeoutRecord): boolean {
  return entry(session, 'VOID') !== null;
}
function toDtoEntry(value: MixedTeamTimeoutEntryRecord | null) {
  if (!value) return null;
  return {
    id: value.id,
    entryType: value.entryType,
    officialName: value.officialName,
    statement: value.statement,
    recordedAt: value.recordedAt,
  };
}
