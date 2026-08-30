import type Database from 'better-sqlite3';

import type {
  ISafetyStopAuditJournal,
  SafetyStopAuditEntry,
  SafetyStopAuditOperation,
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

/** Director-side, append-only command and acknowledgement audit. */
export class SqliteSafetyStopAuditJournal implements ISafetyStopAuditJournal {
  constructor(private readonly db: Database.Database) {}

  append(entry: SafetyStopAuditEntry): void {
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
  }

  find(safetyStopId?: string): SafetyStopAuditEntry[] {
    const rows = (
      safetyStopId
        ? this.db
            .prepare('SELECT * FROM range_safety_stop_audit WHERE safety_stop_id = ? ORDER BY recorded_at, rowid')
            .all(safetyStopId)
        : this.db.prepare('SELECT * FROM range_safety_stop_audit ORDER BY recorded_at, rowid').all()
    ) as SafetyStopAuditRow[];
    return rows.map(toEntry);
  }
}

function toEntry(row: SafetyStopAuditRow): SafetyStopAuditEntry {
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
  });
}
