import type { Migration } from './Migration';

export const migration074EquipmentRegistry: Migration = {
  version: 74,
  name: 'equipment_registry',
  up(db) {
    db.exec(`
      CREATE TABLE equipment_registry_entries (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        championship_id TEXT NOT NULL REFERENCES championships(id),
        kind TEXT NOT NULL CHECK(kind IN ('EQUIPMENT', 'INSPECTION', 'CALIBRATION', 'WITHDRAWAL')),
        payload_json TEXT NOT NULL CHECK(json_valid(payload_json))
      );
      CREATE INDEX idx_equipment_registry_championship ON equipment_registry_entries(championship_id, sequence);
      CREATE TRIGGER trg_equipment_registry_no_update BEFORE UPDATE ON equipment_registry_entries
        BEGIN SELECT RAISE(ABORT, 'equipment registry entries are append-only'); END;
      CREATE TRIGGER trg_equipment_registry_no_delete BEFORE DELETE ON equipment_registry_entries
        BEGIN SELECT RAISE(ABORT, 'equipment registry entries are append-only'); END;
    `);
  },
};
