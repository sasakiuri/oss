import type { Migration } from './Migration';

export const migration085OperationalSettingTemplates: Migration = {
  version: 85,
  name: 'operational_setting_templates',
  up(db) {
    db.exec(`CREATE TABLE operational_setting_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      description TEXT NOT NULL,
      modes_json TEXT NOT NULL CHECK (json_valid(modes_json)),
      revision INTEGER NOT NULL CHECK (revision >= 1),
      updated_at TEXT NOT NULL
    )`);
  },
};
