// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration019: Migration = {
  version: 19,
  name: 'observation_timestamp_source',
  up(db) {
    db.exec(`ALTER TABLE shot_observations ADD COLUMN timestamp_source TEXT NOT NULL DEFAULT 'UNKNOWN'
      CHECK(timestamp_source IN ('UNKNOWN', 'LANE_RECEIPT', 'DEVICE_REPORTED'));`);
  },
};
