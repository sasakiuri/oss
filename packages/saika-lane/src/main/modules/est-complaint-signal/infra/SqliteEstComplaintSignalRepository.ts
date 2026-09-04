// SPDX-License-Identifier: MIT

import type Database from 'better-sqlite3';

import {
  EstComplaintSignalState,
  type EstComplaintIssue,
  type EstComplaintSignalPhase,
} from '../domain/EstComplaintSignalState';
import type { IEstComplaintSignalRepository } from '../domain/IEstComplaintSignalRepository';

interface Row {
  signal_id: string;
  event_type: 'SIGNALLED' | 'CLEARED';
  issue: EstComplaintIssue;
  competition_id: string;
  session_id: string;
  participant_id: string;
  participant_name: string;
  start_number: string | null;
  phase: EstComplaintSignalPhase;
  stage_index: number;
  series_index: number;
  series_shot_limit: number | null;
  recorded_shots: number;
  timed_target_program_id: string | null;
  exposure_index: number | null;
  last_shot_id: string | null;
  last_shot_number_in_series: number | null;
  last_shot_fired_at: string | null;
  last_shot_received_at: string | null;
  message: string | null;
  signalled_at: string;
  occurred_at: string;
  cleared_by: string | null;
}

export class SqliteEstComplaintSignalRepository implements IEstComplaintSignalRepository {
  constructor(private readonly database: Database.Database) {}

  getCurrent(): EstComplaintSignalState | null {
    const row = this.database
      .prepare('SELECT * FROM est_complaint_signal_events ORDER BY recorded_at DESC, rowid DESC LIMIT 1')
      .get() as Row | undefined;
    if (!row) return null;

    return EstComplaintSignalState.create({
      signalId: row.signal_id,
      status: row.event_type === 'SIGNALLED' ? 'ACTIVE' : 'CLEARED',
      issue: row.issue,
      context: {
        competitionId: row.competition_id,
        sessionId: row.session_id,
        participantId: row.participant_id,
        participantName: row.participant_name,
        startNumber: row.start_number,
        phase: row.phase,
        stageIndex: row.stage_index,
        seriesIndex: row.series_index,
        seriesShotLimit: row.series_shot_limit,
        recordedShots: row.recorded_shots,
        timedTargetProgramId: row.timed_target_program_id,
        exposureIndex: row.exposure_index,
        lastShot: row.last_shot_id
          ? {
              shotId: row.last_shot_id,
              shotNumberInSeries: row.last_shot_number_in_series!,
              firedAt: row.last_shot_fired_at!,
              receivedAt: row.last_shot_received_at!,
            }
          : null,
      },
      message: row.message,
      signalledAt: new Date(row.signalled_at),
      ...(row.event_type === 'CLEARED' ? { clearedAt: new Date(row.occurred_at), clearedBy: row.cleared_by } : {}),
    });
  }

  appendSignalled(state: EstComplaintSignalState): void {
    this.insert(state, 'SIGNALLED', state.signalledAt, null);
  }

  appendCleared(state: EstComplaintSignalState): void {
    if (!state.clearedAt || !state.clearedBy) throw new Error('Clearance evidence is incomplete');
    this.insert(state, 'CLEARED', state.clearedAt, state.clearedBy);
  }

  private insert(
    state: EstComplaintSignalState,
    eventType: 'SIGNALLED' | 'CLEARED',
    occurredAt: Date,
    clearedBy: string | null,
  ): void {
    const context = state.context;
    this.database
      .prepare(
        `INSERT INTO est_complaint_signal_events (
          id, signal_id, event_type, issue, competition_id, session_id,
          participant_id, participant_name, start_number, phase,
          stage_index, series_index, series_shot_limit, recorded_shots,
          timed_target_program_id, exposure_index,
          last_shot_id, last_shot_number_in_series, last_shot_fired_at,
          last_shot_received_at, message, signalled_at, occurred_at,
          cleared_by, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        state.signalId,
        eventType,
        state.issue,
        context.competitionId,
        context.sessionId,
        context.participantId,
        context.participantName,
        context.startNumber,
        context.phase,
        context.stageIndex,
        context.seriesIndex,
        context.seriesShotLimit,
        context.recordedShots,
        context.timedTargetProgramId,
        context.exposureIndex,
        context.lastShot?.shotId ?? null,
        context.lastShot?.shotNumberInSeries ?? null,
        context.lastShot?.firedAt ?? null,
        context.lastShot?.receivedAt ?? null,
        state.message,
        state.signalledAt.toISOString(),
        occurredAt.toISOString(),
        clearedBy,
        new Date().toISOString(),
      );
  }
}
