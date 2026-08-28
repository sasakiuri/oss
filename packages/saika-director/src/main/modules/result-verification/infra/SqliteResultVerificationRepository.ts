import type Database from 'better-sqlite3';

import type { IResultVerificationRepository } from '../domain/IResultVerificationRepository';
import {
  ResultListApprovalEntry,
  type ResultApprovalEntryType,
  type ResultApprovalScope,
} from '../domain/ResultListApprovalEntry';
import {
  ResultVerificationCheck,
  type ResultComparisonStatus,
  type ResultEvidenceSource,
} from '../domain/ResultVerificationCheck';

interface CheckRow {
  id: string;
  event_id: string;
  result_id: string;
  participant_id: string;
  player_name: string;
  result_revision: string;
  result_rank: number;
  score_x10: number;
  decision_count_at_check: number;
  evidence_source: ResultEvidenceSource;
  evidence_reference: string;
  comparison_status: ResultComparisonStatus;
  manual_interventions_reviewed: number;
  note: string | null;
  official_name: string;
  checked_at: string;
}

interface ApprovalRow {
  id: string;
  event_id: string;
  result_scope: ResultApprovalScope;
  entry_type: ResultApprovalEntryType;
  snapshot_revision: string;
  required_individual_checks: number;
  required_team_checks: number;
  check_ids_json: string;
  statement: string;
  official_name: string;
  recorded_at: string;
  reverses_approval_id: string | null;
}

export class SqliteResultVerificationRepository implements IResultVerificationRepository {
  constructor(private readonly db: Database.Database) {}

  appendCheck(check: ResultVerificationCheck): void {
    this.db
      .prepare(
        `INSERT INTO result_verification_checks (
           id, event_id, result_id, participant_id, player_name, result_revision,
           result_rank, score_x10, decision_count_at_check, evidence_source,
           evidence_reference, comparison_status, manual_interventions_reviewed,
           note, official_name, checked_at
         ) VALUES (
           @id, @eventId, @resultId, @participantId, @playerName, @resultRevision,
           @resultRank, @scoreX10, @decisionCountAtCheck, @evidenceSource,
           @evidenceReference, @comparisonStatus, @manualInterventionsReviewed,
           @note, @officialName, @checkedAt
         )`,
      )
      .run({
        ...check,
        manualInterventionsReviewed: Number(check.manualInterventionsReviewed),
        checkedAt: check.checkedAt.toISOString(),
      });
  }

  findChecksByEvent(eventId: string): ResultVerificationCheck[] {
    const rows = this.db
      .prepare('SELECT * FROM result_verification_checks WHERE event_id = ? ORDER BY checked_at, rowid')
      .all(eventId) as CheckRow[];
    return rows.map(toCheck);
  }

  appendApprovalEntry(entry: ResultListApprovalEntry): void {
    this.db
      .prepare(
        `INSERT INTO result_list_approval_entries (
           id, event_id, result_scope, entry_type, snapshot_revision,
           required_individual_checks, required_team_checks, check_ids_json,
           statement, official_name, recorded_at, reverses_approval_id
         ) VALUES (
           @id, @eventId, @resultScope, @type, @snapshotRevision,
           @requiredIndividualChecks, @requiredTeamChecks, @checkIdsJson,
           @statement, @officialName, @recordedAt, @reversesApprovalId
         )`,
      )
      .run({
        ...entry,
        checkIdsJson: JSON.stringify(entry.checkIds),
        recordedAt: entry.recordedAt.toISOString(),
      });
  }

  findApprovalEntryById(id: string): ResultListApprovalEntry | null {
    const row = this.db.prepare('SELECT * FROM result_list_approval_entries WHERE id = ?').get(id) as
      ApprovalRow | undefined;
    return row ? toApproval(row) : null;
  }

  findApprovalEntriesByEvent(eventId: string, scope: ResultApprovalScope): ResultListApprovalEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM result_list_approval_entries
         WHERE event_id = ? AND result_scope = ?
         ORDER BY recorded_at, rowid`,
      )
      .all(eventId, scope) as ApprovalRow[];
    return rows.map(toApproval);
  }
}

function toCheck(row: CheckRow): ResultVerificationCheck {
  return ResultVerificationCheck.reconstruct({
    id: row.id,
    eventId: row.event_id,
    resultId: row.result_id,
    participantId: row.participant_id,
    playerName: row.player_name,
    resultRevision: row.result_revision,
    resultRank: row.result_rank,
    scoreX10: row.score_x10,
    decisionCountAtCheck: row.decision_count_at_check,
    evidenceSource: row.evidence_source,
    evidenceReference: row.evidence_reference,
    comparisonStatus: row.comparison_status,
    manualInterventionsReviewed: row.manual_interventions_reviewed === 1,
    note: row.note ?? undefined,
    officialName: row.official_name,
    checkedAt: new Date(row.checked_at),
  });
}

function toApproval(row: ApprovalRow): ResultListApprovalEntry {
  return ResultListApprovalEntry.reconstruct({
    id: row.id,
    eventId: row.event_id,
    resultScope: row.result_scope,
    type: row.entry_type,
    snapshotRevision: row.snapshot_revision,
    requiredIndividualChecks: row.required_individual_checks,
    requiredTeamChecks: row.required_team_checks,
    checkIds: parseCheckIds(row.check_ids_json),
    statement: row.statement,
    officialName: row.official_name,
    recordedAt: new Date(row.recorded_at),
    reversesApprovalId: row.reverses_approval_id,
  });
}

function parseCheckIds(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}
