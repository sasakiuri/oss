import type Database from 'better-sqlite3';

import type { ILaneSafetyStopRepository } from '../domain/ILaneSafetyStopRepository';
import { LaneSafetyStopState, type LaneSafetyTimerSnapshot } from '../domain/LaneSafetyStopState';

interface SafetyEventRow {
  safety_stop_id: string;
  event_type: 'STOPPED' | 'TIMER_FROZEN' | 'CLEARED';
  reason: string;
  official_name: string;
  occurred_at: string;
  competition_id: string | null;
  remaining_seconds: number | null;
  total_seconds: number | null;
}

/** Append-only Lane audit and current-state projection. */
export class SqliteLaneSafetyStopRepository implements ILaneSafetyStopRepository {
  constructor(private readonly db: Database.Database) {}

  getCurrent(): LaneSafetyStopState | null {
    const rows = this.db
      .prepare('SELECT * FROM lane_safety_stop_events ORDER BY recorded_at, rowid')
      .all() as SafetyEventRow[];
    let current: LaneSafetyStopState | null = null;
    for (const row of rows) {
      if (row.event_type === 'STOPPED') {
        current = LaneSafetyStopState.create({
          safetyStopId: row.safety_stop_id,
          status: 'STOPPED',
          reason: row.reason,
          stoppedBy: row.official_name,
          stoppedAt: new Date(row.occurred_at),
        });
      } else if (row.event_type === 'TIMER_FROZEN' && current?.safetyStopId === row.safety_stop_id) {
        if (row.competition_id === null || row.remaining_seconds === null || row.total_seconds === null) {
          throw new Error('Stored safety timer snapshot is incomplete');
        }
        current = current.withTimerSnapshot({
          competitionId: row.competition_id,
          remainingSeconds: row.remaining_seconds,
          totalSeconds: row.total_seconds,
          frozenAt: new Date(row.occurred_at),
        });
      } else if (row.event_type === 'CLEARED' && current?.safetyStopId === row.safety_stop_id) {
        current = current.clear({
          clearedBy: row.official_name,
          clearanceReason: row.reason,
          clearedAt: new Date(row.occurred_at),
        });
      }
    }
    return current;
  }

  appendStopped(state: LaneSafetyStopState): void {
    if (state.status !== 'STOPPED') throw new Error('Stopped event requires a stopped state');
    this.insert(state.safetyStopId, 'STOPPED', state.reason, state.stoppedBy, state.stoppedAt, null);
  }

  appendTimerFrozen(safetyStopId: string, snapshot: LaneSafetyTimerSnapshot): void {
    this.insert(safetyStopId, 'TIMER_FROZEN', 'Competition timer frozen', 'Lane', snapshot.frozenAt, snapshot);
  }

  appendCleared(state: LaneSafetyStopState): void {
    if (state.status !== 'CLEAR' || !state.clearedBy || !state.clearanceReason || !state.clearedAt) {
      throw new Error('Cleared event requires clearance evidence');
    }
    this.insert(state.safetyStopId, 'CLEARED', state.clearanceReason, state.clearedBy, state.clearedAt, null);
  }

  private insert(
    safetyStopId: string,
    eventType: SafetyEventRow['event_type'],
    reason: string,
    officialName: string,
    occurredAt: Date,
    snapshot: LaneSafetyTimerSnapshot | null,
  ): void {
    this.db
      .prepare(
        `INSERT INTO lane_safety_stop_events (
           id, safety_stop_id, event_type, reason, official_name, occurred_at,
           competition_id, remaining_seconds, total_seconds, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        safetyStopId,
        eventType,
        reason,
        officialName,
        occurredAt.toISOString(),
        snapshot?.competitionId ?? null,
        snapshot?.remainingSeconds ?? null,
        snapshot?.totalSeconds ?? null,
        new Date().toISOString(),
      );
  }
}
