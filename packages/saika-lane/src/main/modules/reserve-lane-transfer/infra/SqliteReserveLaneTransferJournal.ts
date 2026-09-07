// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import type { IReserveLaneTransferJournal, ReserveLaneTransferEntry } from '../domain/ReserveLaneTransfer';

export class SqliteReserveLaneTransferJournal implements IReserveLaneTransferJournal {
  constructor(private readonly db: Database.Database) {}
  pending(): boolean {
    return !!this.db
      .prepare(
        `SELECT 1 FROM reserve_lane_transfer_events pending
      WHERE (pending.phase = 'TARGET_STAGED' AND NOT EXISTS (SELECT 1 FROM reserve_lane_transfer_events done WHERE done.transfer_id = pending.transfer_id AND done.phase IN ('TARGET_ACTIVE', 'CANCELLED')))
      OR (pending.phase = 'SOURCE_RETIRING' AND NOT EXISTS (SELECT 1 FROM reserve_lane_transfer_events done WHERE done.transfer_id = pending.transfer_id AND done.phase IN ('SOURCE_RETIRED', 'CANCELLED'))) LIMIT 1`,
      )
      .get();
  }
  list(transferId: string): ReserveLaneTransferEntry[] {
    return this.db
      .prepare('SELECT entry_json FROM reserve_lane_transfer_events WHERE transfer_id = ? ORDER BY rowid')
      .all(transferId)
      .map((row) => JSON.parse((row as { entry_json: string }).entry_json) as ReserveLaneTransferEntry);
  }
  append(entry: ReserveLaneTransferEntry): void {
    this.db
      .prepare('INSERT INTO reserve_lane_transfer_events (id, transfer_id, phase, entry_json) VALUES (?, ?, ?, ?)')
      .run(entry.id, entry.transferId, entry.phase, JSON.stringify(entry));
  }
}
