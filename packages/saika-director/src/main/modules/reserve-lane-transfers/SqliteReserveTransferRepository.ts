// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import type { ReserveLaneTransferRequest } from '@/shared/mqtt/ReserveLaneTransfer';

import type { IReserveTransferRepository, ReserveTransferEntry } from './ReserveLaneTransferService';

export class SqliteReserveTransferRepository implements IReserveTransferRepository {
  constructor(private readonly db: Database.Database) {}
  create(request: ReserveLaneTransferRequest) {
    this.db
      .prepare('INSERT INTO reserve_lane_transfers (id, competition_id, request_json) VALUES (?, ?, ?)')
      .run(request.id, request.competitionId, JSON.stringify(request));
  }
  find(id: string): ReserveLaneTransferRequest | null {
    const row = this.db.prepare('SELECT request_json FROM reserve_lane_transfers WHERE id = ?').get(id) as
      { request_json: string } | undefined;
    return row ? (JSON.parse(row.request_json) as ReserveLaneTransferRequest) : null;
  }
  list(competitionId: string): ReserveLaneTransferRequest[] {
    return this.db
      .prepare('SELECT request_json FROM reserve_lane_transfers WHERE competition_id = ? ORDER BY rowid')
      .all(competitionId)
      .map((row) => JSON.parse((row as { request_json: string }).request_json) as ReserveLaneTransferRequest);
  }
  entries(id: string): ReserveTransferEntry[] {
    return this.db
      .prepare('SELECT entry_json FROM reserve_lane_transfer_events WHERE transfer_id = ? ORDER BY rowid')
      .all(id)
      .map((row) => JSON.parse((row as { entry_json: string }).entry_json) as ReserveTransferEntry);
  }
  append(entry: ReserveTransferEntry) {
    this.db
      .prepare('INSERT INTO reserve_lane_transfer_events (id, transfer_id, operation, entry_json) VALUES (?, ?, ?, ?)')
      .run(entry.id, entry.transferId, entry.operation, JSON.stringify(entry));
  }
}
