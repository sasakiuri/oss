import type Database from 'better-sqlite3';
import type {
  QualificationMalfunctionCapability,
  QualificationMalfunctionClaimAssessment,
  QualificationMalfunctionClassification,
  RulePackIdentity,
} from '@sasakiuri/saika-rules';

import type { IQualificationMalfunctionRepository } from '../domain/IQualificationMalfunctionRepository';
import {
  QualificationMalfunctionCase,
  QualificationMalfunctionEntry,
  type QualificationMalfunctionClaimMode,
  type QualificationMalfunctionEntryType,
  type QualificationMalfunctionOfficialRole,
  type QualificationMalfunctionRemedy,
  type QualificationMalfunctionReportSource,
} from '../domain/QualificationMalfunctionCase';

interface CaseRow {
  id: string;
  competition_id: string;
  event_id: string;
  competition_type_id: string;
  rule_pack_id: string | null;
  rule_pack_schema_version: 1 | null;
  rule_pack_fingerprint_sha256: string | null;
  policy_snapshot_json: string;
  participant_id: string;
  participant_name_snapshot: string;
  start_number_snapshot: string | null;
  lane_id: string;
  lane_channel_snapshot: number;
  relay_number_snapshot: number;
  report_source: QualificationMalfunctionReportSource;
  source_signal_id: string | null;
  claim_mode: QualificationMalfunctionClaimMode;
  phase: 'SIGHTING' | 'MATCH';
  stage_id: string | null;
  stage_index: number;
  series_index: number;
  series_shot_limit: number | null;
  recorded_shots: number;
  timed_target_program_id: string | null;
  exposure_index: number | null;
  lane_session_id: string | null;
  lane_snapshot_captured_at: string | null;
  exceptional_match_part: 1 | 2 | null;
  existing_claims_in_scope: number;
  existing_claims_in_part: number | null;
  claim_assessment_json: string;
  summary: string;
  opened_by: string;
  occurred_at: string;
  created_at: string;
}

interface EntryRow {
  id: string;
  case_id: string;
  entry_type: QualificationMalfunctionEntryType;
  statement: string;
  official_name: string;
  official_role: QualificationMalfunctionOfficialRole;
  rule_reference: string | null;
  classification: QualificationMalfunctionClassification | null;
  cause_code: string | null;
  remedy: QualificationMalfunctionRemedy | null;
  shots_to_fire: number | null;
  repair_seconds: number | null;
  artifact_id: string | null;
  occurred_at: string;
  recorded_at: string;
}

export class SqliteQualificationMalfunctionRepository implements IQualificationMalfunctionRepository {
  constructor(private readonly db: Database.Database) {}

  appendCase(value: QualificationMalfunctionCase): void {
    this.db
      .prepare(
        `INSERT INTO qualification_malfunction_cases (
          id, competition_id, event_id, competition_type_id,
          rule_pack_id, rule_pack_schema_version, rule_pack_fingerprint_sha256,
          policy_snapshot_json, participant_id, participant_name_snapshot, start_number_snapshot,
          lane_id, lane_channel_snapshot, relay_number_snapshot, report_source, source_signal_id, claim_mode,
          phase, stage_id, stage_index, series_index, series_shot_limit, recorded_shots,
          timed_target_program_id, exposure_index, lane_session_id, lane_snapshot_captured_at,
          exceptional_match_part, existing_claims_in_scope, existing_claims_in_part,
          claim_assessment_json, summary, opened_by, occurred_at, created_at
        ) VALUES (
          @id, @competitionId, @eventId, @competitionTypeId,
          @rulePackId, @rulePackSchemaVersion, @rulePackFingerprintSha256,
          @policySnapshotJson, @participantId, @participantNameSnapshot, @startNumberSnapshot,
          @laneId, @laneChannelSnapshot, @relayNumberSnapshot, @reportSource, @sourceSignalId, @claimMode,
          @phase, @stageId, @stageIndex, @seriesIndex, @seriesShotLimit, @recordedShots,
          @timedTargetProgramId, @exposureIndex, @laneSessionId, @laneSnapshotCapturedAt,
          @exceptionalMatchPart, @existingClaimsInScope, @existingClaimsInPart,
          @claimAssessmentJson, @summary, @openedBy, @occurredAt, @createdAt
        )`,
      )
      .run({
        ...value,
        ...toIdentityParams(value.rulePackIdentity),
        policySnapshotJson: JSON.stringify(value.policySnapshot),
        claimAssessmentJson: JSON.stringify(value.claimAssessment),
        laneSnapshotCapturedAt: value.laneSnapshotCapturedAt?.toISOString() ?? null,
        occurredAt: value.occurredAt.toISOString(),
        createdAt: value.createdAt.toISOString(),
      });
  }

  appendEntry(value: QualificationMalfunctionEntry): void {
    this.db
      .prepare(
        `INSERT INTO qualification_malfunction_entries (
          id, case_id, entry_type, statement, official_name, official_role, rule_reference,
          classification, cause_code, remedy, shots_to_fire, repair_seconds, artifact_id,
          occurred_at, recorded_at
        ) VALUES (
          @id, @caseId, @type, @statement, @officialName, @officialRole, @ruleReference,
          @classification, @causeCode, @remedy, @shotsToFire, @repairSeconds, @artifactId,
          @occurredAt, @recordedAt
        )`,
      )
      .run({
        ...value,
        occurredAt: value.occurredAt.toISOString(),
        recordedAt: value.recordedAt.toISOString(),
      });
  }

  findCaseById(id: string): QualificationMalfunctionCase | null {
    const row = this.db.prepare('SELECT * FROM qualification_malfunction_cases WHERE id = ?').get(id) as
      CaseRow | undefined;
    return row ? toCase(row) : null;
  }

  findCasesByCompetition(competitionId: string): QualificationMalfunctionCase[] {
    return this.findCases('competition_id', competitionId);
  }

  findCasesByEvent(eventId: string): QualificationMalfunctionCase[] {
    return this.findCases('event_id', eventId);
  }

  findCasesByEventAndParticipant(eventId: string, participantId: string): QualificationMalfunctionCase[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM qualification_malfunction_cases
           WHERE event_id = ? AND participant_id = ? ORDER BY occurred_at, rowid`,
        )
        .all(eventId, participantId) as CaseRow[]
    ).map(toCase);
  }

  findEntries(caseIds: readonly string[]): Map<string, QualificationMalfunctionEntry[]> {
    const result = new Map(caseIds.map((id) => [id, [] as QualificationMalfunctionEntry[]]));
    if (caseIds.length === 0) return result;
    const rows = this.db
      .prepare(
        `SELECT * FROM qualification_malfunction_entries
         WHERE case_id IN (${caseIds.map(() => '?').join(',')})
         ORDER BY recorded_at, rowid`,
      )
      .all(...caseIds) as EntryRow[];
    for (const row of rows) result.get(row.case_id)?.push(toEntry(row));
    return result;
  }

  executeInTransaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }

  private findCases(column: 'competition_id' | 'event_id', id: string): QualificationMalfunctionCase[] {
    return (
      this.db
        .prepare(`SELECT * FROM qualification_malfunction_cases WHERE ${column} = ? ORDER BY occurred_at, rowid`)
        .all(id) as CaseRow[]
    ).map(toCase);
  }
}

function toCase(row: CaseRow): QualificationMalfunctionCase {
  return QualificationMalfunctionCase.reconstruct({
    id: row.id,
    competitionId: row.competition_id,
    eventId: row.event_id,
    competitionTypeId: row.competition_type_id,
    rulePackIdentity: toIdentity(row),
    policySnapshot: JSON.parse(row.policy_snapshot_json) as QualificationMalfunctionCapability,
    participantId: row.participant_id,
    participantNameSnapshot: row.participant_name_snapshot,
    startNumberSnapshot: row.start_number_snapshot,
    laneId: row.lane_id,
    laneChannelSnapshot: row.lane_channel_snapshot,
    relayNumberSnapshot: row.relay_number_snapshot,
    reportSource: row.report_source,
    sourceSignalId: row.source_signal_id,
    claimMode: row.claim_mode,
    phase: row.phase,
    stageId: row.stage_id,
    stageIndex: row.stage_index,
    seriesIndex: row.series_index,
    seriesShotLimit: row.series_shot_limit,
    recordedShots: row.recorded_shots,
    timedTargetProgramId: row.timed_target_program_id,
    exposureIndex: row.exposure_index,
    laneSessionId: row.lane_session_id,
    laneSnapshotCapturedAt: row.lane_snapshot_captured_at ? new Date(row.lane_snapshot_captured_at) : null,
    exceptionalMatchPart: row.exceptional_match_part,
    existingClaimsInScope: row.existing_claims_in_scope,
    existingClaimsInPart: row.existing_claims_in_part,
    claimAssessment: JSON.parse(row.claim_assessment_json) as QualificationMalfunctionClaimAssessment,
    summary: row.summary,
    openedBy: row.opened_by,
    occurredAt: new Date(row.occurred_at),
    createdAt: new Date(row.created_at),
  });
}

function toEntry(row: EntryRow): QualificationMalfunctionEntry {
  return QualificationMalfunctionEntry.reconstruct({
    id: row.id,
    caseId: row.case_id,
    type: row.entry_type,
    statement: row.statement,
    officialName: row.official_name,
    officialRole: row.official_role,
    ruleReference: row.rule_reference,
    classification: row.classification,
    causeCode: row.cause_code,
    remedy: row.remedy,
    shotsToFire: row.shots_to_fire,
    repairSeconds: row.repair_seconds,
    artifactId: row.artifact_id,
    occurredAt: new Date(row.occurred_at),
    recordedAt: new Date(row.recorded_at),
  });
}

function toIdentityParams(identity: RulePackIdentity | null): {
  rulePackId: string | null;
  rulePackSchemaVersion: number | null;
  rulePackFingerprintSha256: string | null;
} {
  return {
    rulePackId: identity?.id ?? null,
    rulePackSchemaVersion: identity?.schemaVersion ?? null,
    rulePackFingerprintSha256: identity?.fingerprint.value ?? null,
  };
}

function toIdentity(row: CaseRow): RulePackIdentity | null {
  if (!row.rule_pack_id) return null;
  if (row.rule_pack_schema_version !== 1 || !row.rule_pack_fingerprint_sha256) {
    throw new Error(`Qualification malfunction case ${row.id} has an incomplete Rule Pack identity`);
  }
  return {
    id: row.rule_pack_id,
    schemaVersion: 1,
    fingerprint: { algorithm: 'SHA-256', value: row.rule_pack_fingerprint_sha256 },
  };
}
