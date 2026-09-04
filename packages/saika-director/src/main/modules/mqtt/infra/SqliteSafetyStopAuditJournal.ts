import type Database from 'better-sqlite3';

import type {
  ISafetyStopAuditJournal,
  SafetyStopAuditEntry,
  SafetyStopAuditOperation,
  SafetyStopFirearmCondition,
  SafetyStopLaneClearance,
  SafetyStopLaneOutcome,
} from '../domain/ISafetyStopAuditJournal';

interface SafetyStopAuditRow {
  id: string;
  safety_stop_id: string;
  operation: SafetyStopAuditOperation;
  target_lane_ids_json: string;
  success: number;
  reason: string;
  official_name: string;
  occurred_at: string;
  recorded_at: string;
  lane_outcomes_json: string;
}

interface SafetyStopLaneClearanceRow {
  id: string;
  lane_id: string;
  participant_id: string | null;
  participant_name: string | null;
  athlete_confirmation_status: 'CONFIRMED' | 'NOT_APPLICABLE';
  athlete_confirmed_by: string | null;
  not_applicable_reason: string | null;
  firearm_condition: SafetyStopFirearmCondition;
  personnel_clear: 1;
  verified_by: string;
  verification_note: string | null;
  verified_at: string;
  recorded_at: string;
  rule_references_json: string;
}

/** Director-side, append-only command and acknowledgement audit. */
export class SqliteSafetyStopAuditJournal implements ISafetyStopAuditJournal {
  constructor(private readonly db: Database.Database) {}

  append(entry: SafetyStopAuditEntry): void {
    if (entry.operation === 'ACTIVATE' && entry.laneClearances.length > 0) {
      throw new Error('Safety STOP activation cannot contain Lane clearances');
    }
    if (entry.operation === 'CLEAR' && entry.laneClearances.length !== entry.targetLaneIds.length) {
      throw new Error('Every safety clear target requires one Lane clearance');
    }
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO range_safety_stop_audit (
             id, safety_stop_id, operation, target_lane_ids_json, success,
             reason, official_name, occurred_at, recorded_at, lane_outcomes_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          entry.id,
          entry.safetyStopId,
          entry.operation,
          JSON.stringify(entry.targetLaneIds),
          Number(entry.success),
          entry.reason,
          entry.officialName,
          entry.occurredAt.toISOString(),
          entry.recordedAt.toISOString(),
          JSON.stringify(
            entry.laneOutcomes.map((outcome) => ({
              ...outcome,
              acknowledgedAt: outcome.acknowledgedAt?.toISOString() ?? null,
            })),
          ),
        );
      for (const clearance of entry.laneClearances) this.insertClearance(entry, clearance);
    })();
  }

  find(safetyStopId?: string): SafetyStopAuditEntry[] {
    const rows = (
      safetyStopId
        ? this.db
            .prepare('SELECT * FROM range_safety_stop_audit WHERE safety_stop_id = ? ORDER BY recorded_at, rowid')
            .all(safetyStopId)
        : this.db.prepare('SELECT * FROM range_safety_stop_audit ORDER BY recorded_at, rowid').all()
    ) as SafetyStopAuditRow[];
    const findClearances = this.db.prepare(
      'SELECT * FROM range_safety_lane_clearances WHERE audit_entry_id = ? ORDER BY verified_at, rowid',
    );
    return rows.map((row) => toEntry(row, findClearances.all(row.id) as SafetyStopLaneClearanceRow[]));
  }

  private insertClearance(entry: SafetyStopAuditEntry, clearance: SafetyStopLaneClearance): void {
    if (!entry.targetLaneIds.includes(clearance.laneId)) {
      throw new Error(`Safety clearance Lane ${clearance.laneId} is not an audit target`);
    }
    this.db
      .prepare(
        `INSERT INTO range_safety_lane_clearances (
          id, audit_entry_id, safety_stop_id, lane_id, participant_id, participant_name,
          athlete_confirmation_status, athlete_confirmed_by, not_applicable_reason,
          firearm_condition, personnel_clear, verified_by, verification_note,
          verified_at, recorded_at, rule_references_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        clearance.id,
        entry.id,
        entry.safetyStopId,
        clearance.laneId,
        clearance.participantId,
        clearance.participantName,
        clearance.athleteConfirmationStatus,
        clearance.athleteConfirmedBy,
        clearance.notApplicableReason,
        clearance.firearmCondition,
        Number(clearance.personnelClear),
        clearance.verifiedBy,
        clearance.verificationNote,
        clearance.verifiedAt.toISOString(),
        clearance.recordedAt.toISOString(),
        JSON.stringify(clearance.ruleReferences),
      );
  }
}

function toEntry(row: SafetyStopAuditRow, clearances: SafetyStopLaneClearanceRow[]): SafetyStopAuditEntry {
  const outcomes = JSON.parse(row.lane_outcomes_json) as Array<
    Omit<SafetyStopLaneOutcome, 'acknowledgedAt'> & { acknowledgedAt: string | null }
  >;
  return Object.freeze({
    id: row.id,
    safetyStopId: row.safety_stop_id,
    operation: row.operation,
    targetLaneIds: Object.freeze([...(JSON.parse(row.target_lane_ids_json) as string[])]),
    success: row.success === 1,
    reason: row.reason,
    officialName: row.official_name,
    occurredAt: new Date(row.occurred_at),
    recordedAt: new Date(row.recorded_at),
    laneOutcomes: Object.freeze(
      outcomes.map((outcome) =>
        Object.freeze({
          ...outcome,
          acknowledgedAt: outcome.acknowledgedAt ? new Date(outcome.acknowledgedAt) : null,
        }),
      ),
    ),
    laneClearances: Object.freeze(clearances.map(toClearance)),
  });
}

function toClearance(row: SafetyStopLaneClearanceRow): SafetyStopLaneClearance {
  return Object.freeze({
    id: row.id,
    laneId: row.lane_id,
    participantId: row.participant_id,
    participantName: row.participant_name,
    athleteConfirmationStatus: row.athlete_confirmation_status,
    athleteConfirmedBy: row.athlete_confirmed_by,
    notApplicableReason: row.not_applicable_reason,
    firearmCondition: row.firearm_condition,
    personnelClear: true,
    verifiedBy: row.verified_by,
    verificationNote: row.verification_note,
    verifiedAt: new Date(row.verified_at),
    recordedAt: new Date(row.recorded_at),
    ruleReferences: Object.freeze([...(JSON.parse(row.rule_references_json) as string[])]),
  });
}
