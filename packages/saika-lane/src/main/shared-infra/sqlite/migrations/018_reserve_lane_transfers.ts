// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration018: Migration = {
  version: 18,
  name: 'reserve_lane_transfers',
  up(db) {
    db.exec(`CREATE TABLE reserve_lane_transfer_events (
      id TEXT PRIMARY KEY, transfer_id TEXT NOT NULL, phase TEXT NOT NULL,
      entry_json TEXT NOT NULL CHECK(json_valid(entry_json)), UNIQUE(transfer_id, phase)
    );
    CREATE TRIGGER reserve_transfers_no_update BEFORE UPDATE ON reserve_lane_transfer_events
      BEGIN SELECT RAISE(ABORT, 'Reserve transfer history is append-only'); END;
    CREATE TRIGGER reserve_transfers_no_delete BEFORE DELETE ON reserve_lane_transfer_events
      BEGIN SELECT RAISE(ABORT, 'Reserve transfer history is append-only'); END;`);
  },
};
