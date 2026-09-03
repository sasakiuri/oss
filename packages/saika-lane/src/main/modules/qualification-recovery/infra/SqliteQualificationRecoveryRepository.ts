// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import type { IQualificationRecoveryRepository } from '../domain/IQualificationRecoveryRepository';
import {
  createQualificationRecoveryRunStart,
  freezeQualificationRecoveryRunRecord,
  type QualificationRecoveryRecordedShot,
  type QualificationRecoveryRunRecord,
  type QualificationRecoveryRunStart,
  type QualificationRecoveryRunStatus,
} from '../domain/QualificationRecoveryRun';

interface EventRow {
  id: string;
  run_id: string;
  competition_id: string;
  event_type: 'STARTED' | 'SHOT_RECORDED' | Exclude<QualificationRecoveryRunStatus, 'RUNNING'>;
  start_json: string | null;
  shot_id: string | null;
  observation_id: string | null;
  reason: string | null;
  occurred_at: string;
  recorded_at: string;
}

interface SerializedStart extends Omit<QualificationRecoveryRunStart, 'loadAt' | 'decidedAt' | 'startedAt'> {
  loadAt: string;
  decidedAt: string;
  startedAt: string;
}

/** Append-only recovery firing audit with a projected current state. */
export class SqliteQualificationRecoveryRepository implements IQualificationRecoveryRepository {
  constructor(private readonly db: Database.Database) {}

  appendStarted(start: QualificationRecoveryRunStart): void {
    const validated = createQualificationRecoveryRunStart(start);
    this.db
      .prepare(
        `INSERT INTO qualification_recovery_run_events (
           id, run_id, competition_id, event_type, start_json, shot_id,
           observation_id, reason, occurred_at, recorded_at
         ) VALUES (?, ?, ?, 'STARTED', ?, NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        validated.runId,
        validated.competitionId,
        serializeStart(validated),
        validated.loadAt.toISOString(),
        validated.startedAt.toISOString(),
      );
  }

  appendShot(runId: string, shot: QualificationRecoveryRecordedShot): void {
    const competitionId = this.requireCompetitionId(runId);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO qualification_recovery_run_events (
           id, run_id, competition_id, event_type, start_json, shot_id,
           observation_id, reason, occurred_at, recorded_at
         ) VALUES (?, ?, ?, 'SHOT_RECORDED', NULL, ?, ?, NULL, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        runId,
        competitionId,
        shot.shotId,
        shot.observationId,
        shot.firedAt.toISOString(),
        shot.recordedAt.toISOString(),
      );
  }

  appendTerminal(input: Parameters<IQualificationRecoveryRepository['appendTerminal']>[0]): void {
    const competitionId = this.requireCompetitionId(input.runId);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO qualification_recovery_run_events (
           id, run_id, competition_id, event_type, start_json, shot_id,
           observation_id, reason, occurred_at, recorded_at
         ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        input.runId,
        competitionId,
        input.status,
        input.reason,
        input.occurredAt.toISOString(),
        input.recordedAt.toISOString(),
      );
  }

  findByRunId(runId: string): QualificationRecoveryRunRecord | null {
    const rows = this.db
      .prepare(
        `SELECT * FROM qualification_recovery_run_events
         WHERE run_id = ? ORDER BY recorded_at, rowid`,
      )
      .all(runId) as EventRow[];
    return toRecord(rows);
  }

  findLatest(competitionId?: string): QualificationRecoveryRunRecord | null {
    const started = (
      competitionId
        ? this.db
            .prepare(
              `SELECT run_id FROM qualification_recovery_run_events
               WHERE competition_id = ? AND event_type = 'STARTED'
               ORDER BY recorded_at DESC, rowid DESC LIMIT 1`,
            )
            .get(competitionId)
        : this.db
            .prepare(
              `SELECT run_id FROM qualification_recovery_run_events
               WHERE event_type = 'STARTED'
               ORDER BY recorded_at DESC, rowid DESC LIMIT 1`,
            )
            .get()
    ) as { run_id: string } | undefined;
    return started ? this.findByRunId(started.run_id) : null;
  }

  private requireCompetitionId(runId: string): string {
    const row = this.db
      .prepare(
        `SELECT competition_id FROM qualification_recovery_run_events
         WHERE run_id = ? AND event_type = 'STARTED' LIMIT 1`,
      )
      .get(runId) as { competition_id: string } | undefined;
    if (!row) throw new Error(`Qualification recovery run ${runId} does not exist`);
    return row.competition_id;
  }
}

function serializeStart(start: QualificationRecoveryRunStart): string {
  return JSON.stringify(start);
}

function parseStart(payload: string): QualificationRecoveryRunStart {
  const value = JSON.parse(payload) as SerializedStart;
  return createQualificationRecoveryRunStart({
    ...value,
    loadAt: new Date(value.loadAt),
    decidedAt: new Date(value.decidedAt),
    startedAt: new Date(value.startedAt),
  });
}

function toRecord(rows: readonly EventRow[]): QualificationRecoveryRunRecord | null {
  const started = rows.find((row) => row.event_type === 'STARTED');
  if (!started?.start_json) return null;
  const terminal = [...rows].reverse().find((row) => row.event_type === 'COMPLETED' || row.event_type === 'CANCELLED');
  return freezeQualificationRecoveryRunRecord({
    ...parseStart(started.start_json),
    status: terminal ? (terminal.event_type as Exclude<QualificationRecoveryRunStatus, 'RUNNING'>) : 'RUNNING',
    terminalReason: terminal?.reason ?? null,
    terminalAt: terminal ? new Date(terminal.occurred_at) : null,
    shots: rows
      .filter((row): row is EventRow & { shot_id: string } => row.event_type === 'SHOT_RECORDED' && !!row.shot_id)
      .map((row) => ({
        shotId: row.shot_id,
        observationId: row.observation_id,
        firedAt: new Date(row.occurred_at),
        recordedAt: new Date(row.recorded_at),
      })),
  });
}
