// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration070ReserveLaneTransfers: Migration = {
  version: 70,
  name: 'reserve_lane_transfers',
  up(db) {
    db.exec(`CREATE TABLE reserve_lane_transfers (id TEXT PRIMARY KEY, competition_id TEXT NOT NULL, request_json TEXT NOT NULL CHECK(json_valid(request_json)));
    CREATE INDEX reserve_transfers_competition ON reserve_lane_transfers(competition_id);
    CREATE TABLE reserve_lane_transfer_events (id TEXT PRIMARY KEY, transfer_id TEXT NOT NULL REFERENCES reserve_lane_transfers(id), operation TEXT NOT NULL, entry_json TEXT NOT NULL CHECK(json_valid(entry_json)));
    CREATE INDEX reserve_transfer_events_transfer ON reserve_lane_transfer_events(transfer_id);`);
    for (const table of ['reserve_lane_transfers', 'reserve_lane_transfer_events'])
      db.exec(`CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'Reserve transfer history is append-only'); END;
    CREATE TRIGGER ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, 'Reserve transfer history is append-only'); END;`);
  },
};
