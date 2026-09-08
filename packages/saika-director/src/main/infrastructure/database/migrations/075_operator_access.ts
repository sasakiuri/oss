import type { Migration } from './Migration';
export const migration075OperatorAccess: Migration = {
  version: 75,
  name: 'operator_access',
  up(db) {
    db.exec(`
    CREATE TABLE operator_access_settings (id INTEGER PRIMARY KEY CHECK(id = 1), enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)));
    INSERT INTO operator_access_settings (id, enabled) VALUES (1, 0);
    CREATE TABLE operator_accounts (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)));
    CREATE TABLE operator_access_audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)));
    CREATE TRIGGER trg_operator_access_audit_no_update BEFORE UPDATE ON operator_access_audit BEGIN SELECT RAISE(ABORT, 'operator audit is append-only'); END;
    CREATE TRIGGER trg_operator_access_audit_no_delete BEFORE DELETE ON operator_access_audit BEGIN SELECT RAISE(ABORT, 'operator audit is append-only'); END;
  `);
  },
};
