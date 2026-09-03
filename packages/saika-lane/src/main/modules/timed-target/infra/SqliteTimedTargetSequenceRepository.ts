// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import type {
  ITimedTargetSequenceRepository,
  TimedTargetAcceptedShot,
  TimedTargetSequenceRecord,
  TimedTargetTerminalStatus,
} from '../domain/ITimedTargetSequenceRepository';
import { parseTimedTargetSchedule, serializeTimedTargetSchedule } from '../domain/TimedTargetSchedule';

interface EventRow {
  id: string;
  sequence_id: string;
  competition_id: string;
  event_type: 'STARTED' | 'SHOT_ACCEPTED' | TimedTargetTerminalStatus;
  schedule_json: string | null;
  observation_id: string | null;
  exposure_index: number | null;
  reason: string | null;
  occurred_at: string;
  recorded_at: string;
}

export class SqliteTimedTargetSequenceRepository implements ITimedTargetSequenceRepository {
  constructor(private readonly db: Database.Database) {}

  appendStarted(schedule: Parameters<ITimedTargetSequenceRepository['appendStarted']>[0], recordedAt: Date): void {
    this.db
      .prepare(
        `INSERT INTO timed_target_sequence_events (
           id, sequence_id, competition_id, event_type, schedule_json,
           observation_id, exposure_index, reason, occurred_at, recorded_at
         ) VALUES (?, ?, ?, 'STARTED', ?, NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        schedule.sequenceId,
        schedule.competitionId,
        serializeTimedTargetSchedule(schedule),
        schedule.loadAt.toISOString(),
        recordedAt.toISOString(),
      );
  }

  appendAcceptedShot(shot: TimedTargetAcceptedShot): void {
    const competitionId = this.requireCompetitionId(shot.sequenceId);
    this.db
      .prepare(
        `INSERT INTO timed_target_sequence_events (
           id, sequence_id, competition_id, event_type, schedule_json,
           observation_id, exposure_index, reason, occurred_at, recorded_at
         ) VALUES (?, ?, ?, 'SHOT_ACCEPTED', NULL, ?, ?, NULL, ?, ?)`,
      )
      .run(
        shot.id,
        shot.sequenceId,
        competitionId,
        shot.observationId,
        shot.exposureIndex,
        shot.firedAt.toISOString(),
        shot.recordedAt.toISOString(),
      );
  }

  appendTerminal(input: {
    sequenceId: string;
    status: TimedTargetTerminalStatus;
    reason: string;
    occurredAt: Date;
    recordedAt: Date;
  }): void {
    const competitionId = this.requireCompetitionId(input.sequenceId);
    this.db
      .prepare(
        `INSERT INTO timed_target_sequence_events (
           id, sequence_id, competition_id, event_type, schedule_json,
           observation_id, exposure_index, reason, occurred_at, recorded_at
         ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        input.sequenceId,
        competitionId,
        input.status,
        input.reason,
        input.occurredAt.toISOString(),
        input.recordedAt.toISOString(),
      );
  }

  findBySequenceId(sequenceId: string): TimedTargetSequenceRecord | null {
    const rows = this.db
      .prepare(
        `SELECT * FROM timed_target_sequence_events
         WHERE sequence_id = ?
         ORDER BY recorded_at, rowid`,
      )
      .all(sequenceId) as EventRow[];
    return this.toRecord(rows);
  }

  findLatest(competitionId?: string): TimedTargetSequenceRecord | null {
    const started = (
      competitionId
        ? this.db
            .prepare(
              `SELECT * FROM timed_target_sequence_events
             WHERE event_type = 'STARTED' AND competition_id = ?
             ORDER BY recorded_at DESC, rowid DESC LIMIT 1`,
            )
            .get(competitionId)
        : this.db
            .prepare(
              `SELECT * FROM timed_target_sequence_events
             WHERE event_type = 'STARTED'
             ORDER BY recorded_at DESC, rowid DESC LIMIT 1`,
            )
            .get()
    ) as EventRow | undefined;
    return started ? this.findBySequenceId(started.sequence_id) : null;
  }

  private requireCompetitionId(sequenceId: string): string {
    const row = this.db
      .prepare(
        `SELECT competition_id FROM timed_target_sequence_events
         WHERE sequence_id = ? AND event_type = 'STARTED' LIMIT 1`,
      )
      .get(sequenceId) as { competition_id: string } | undefined;
    if (!row) throw new Error(`Timed target sequence ${sequenceId} does not exist`);
    return row.competition_id;
  }

  private toRecord(rows: readonly EventRow[]): TimedTargetSequenceRecord | null {
    const started = rows.find((row) => row.event_type === 'STARTED');
    if (!started?.schedule_json) return null;
    const terminal = [...rows]
      .reverse()
      .find((row) => row.event_type === 'COMPLETED' || row.event_type === 'CANCELLED');
    return Object.freeze({
      schedule: parseTimedTargetSchedule(started.schedule_json),
      startedAt: new Date(started.recorded_at),
      terminalStatus: terminal ? (terminal.event_type as TimedTargetTerminalStatus) : null,
      terminalReason: terminal?.reason ?? null,
      terminalAt: terminal ? new Date(terminal.occurred_at) : null,
      acceptedShots: Object.freeze(
        rows
          .filter(
            (row): row is EventRow & { observation_id: string; exposure_index: number } =>
              row.event_type === 'SHOT_ACCEPTED' && row.observation_id !== null && row.exposure_index !== null,
          )
          .map((row) =>
            Object.freeze({
              id: row.id,
              sequenceId: row.sequence_id,
              observationId: row.observation_id,
              exposureIndex: row.exposure_index,
              firedAt: new Date(row.occurred_at),
              recordedAt: new Date(row.recorded_at),
            }),
          ),
      ),
    });
  }
}
