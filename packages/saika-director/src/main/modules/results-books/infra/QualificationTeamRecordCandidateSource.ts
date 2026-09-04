// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  EligibleRecordResult,
  IResultsBookQualificationTeamSource,
  IResultsBookRecordCandidateSource,
  IResultsBookResultSnapshotSource,
  ResultsBookQualificationTeamResult,
  ResultsBookResultSnapshot,
} from '../domain/ResultsBookModels';

interface EventRow {
  readonly id: string;
  readonly name: string;
}

/** Adds derived Team candidates without extending the individual result projection. */
export class QualificationTeamRecordCandidateSource implements IResultsBookRecordCandidateSource {
  constructor(
    private readonly db: Database.Database,
    private readonly teams: IResultsBookQualificationTeamSource,
    private readonly snapshots: IResultsBookResultSnapshotSource,
  ) {}

  async eligibleRecordResults(championshipId: string): Promise<readonly EligibleRecordResult[]> {
    const events = this.db
      .prepare('SELECT id, name FROM events WHERE championship_id = ? ORDER BY sort_order, id')
      .all(championshipId) as EventRow[];
    const candidates = await Promise.all(events.map((event) => this.forEvent(event)));
    return candidates.flat();
  }

  private async forEvent(event: EventRow): Promise<EligibleRecordResult[]> {
    try {
      const before = await this.snapshots.load(event.id, 'QUALIFICATION');
      if (!isCurrentOfficial(before)) return [];
      const teams = await this.teams.getQualification(event.id, 'THREE_MEMBER');
      const after = await this.snapshots.load(event.id, 'QUALIFICATION');
      if (!isSameCurrentOfficial(before, after)) return [];
      return teams.filter(isEligibleTeam).map((team) => toCandidate(event, after.snapshotRevision, team));
    } catch {
      // Events without a Qualification projection or Team configuration are not candidate sources.
      return [];
    }
  }
}

function isCurrentOfficial(snapshot: ResultsBookResultSnapshot): boolean {
  return snapshot.publicationIssues.length === 0 && snapshot.officialPublicationRevision === snapshot.snapshotRevision;
}

function isSameCurrentOfficial(before: ResultsBookResultSnapshot, after: ResultsBookResultSnapshot): boolean {
  return isCurrentOfficial(after) && before.snapshotRevision === after.snapshotRevision;
}

function isEligibleTeam(team: ResultsBookQualificationTeamResult): boolean {
  if (
    !team.eligible ||
    !Number.isInteger(team.rank) ||
    team.rank <= 0 ||
    !team.teamId.trim() ||
    !team.teamName.trim() ||
    !team.nationCode?.trim() ||
    !Number.isFinite(team.totalScore) ||
    team.totalScore < 0 ||
    team.members.length !== 3
  ) {
    return false;
  }
  if (new Set(team.members.map((member) => member.participantId)).size !== team.members.length) return false;
  const genders = new Set(team.members.map((member) => member.gender));
  if (genders.size !== 1 || genders.has('UNSPECIFIED')) return false;
  if (
    team.members.some(
      (member) =>
        !member.participantId.trim() ||
        !member.playerName.trim() ||
        !member.familyName.trim() ||
        !member.gender.trim() ||
        member.entryStatus !== 'COMPETING' ||
        member.nationCode !== team.nationCode ||
        member.classificationCode !== null ||
        member.totalScore === null ||
        !Number.isFinite(member.totalScore) ||
        member.totalScore < 0 ||
        !Number.isInteger(member.decisionCount) ||
        member.decisionCount < 0,
    )
  ) {
    return false;
  }
  const memberTotalX10 = team.members.reduce((total, member) => total + Math.round((member.totalScore ?? 0) * 10), 0);
  return memberTotalX10 === Math.round(team.totalScore * 10);
}

function toCandidate(
  event: EventRow,
  officialResultRevision: string,
  team: ResultsBookQualificationTeamResult,
): EligibleRecordResult {
  const members = [...team.members]
    .map((member) => ({
      participantId: member.participantId,
      playerName: member.playerName,
      familyName: member.familyName,
      nationCode: member.nationCode,
      gender: member.gender,
      entryStatus: member.entryStatus,
      scoreX10: Math.round((member.totalScore ?? 0) * 10),
      classificationCode: member.classificationCode,
      decisionCount: member.decisionCount,
    }))
    .sort((left, right) => left.participantId.localeCompare(right.participantId));
  const source = {
    kind: 'QUALIFICATION_THREE_MEMBER_TEAM',
    eventId: event.id,
    officialResultRevision,
    teamId: team.teamId,
    teamName: team.teamName,
    nationCode: team.nationCode,
    totalScoreX10: Math.round(team.totalScore * 10),
    members,
  } as const;
  return {
    eventId: event.id,
    eventName: event.name,
    resultScope: 'QUALIFICATION',
    resultId: nameUuid(`saika:qualification-team-record:${event.id}:${team.teamId}`),
    subjectKind: 'TEAM',
    subjectId: team.teamId,
    subjectName: team.teamName,
    nationCode: team.nationCode,
    entryStatus: 'COMPETING',
    scoreX10: Math.round(team.totalScore * 10),
    snapshotRevision: digest(source),
    members,
  };
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** RFC 4122 UUIDv5 using the standard URL namespace, implemented without another runtime dependency. */
function nameUuid(name: string): string {
  const namespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
  const bytes = createHash('sha1').update(namespace).update(name).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
