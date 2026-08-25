import type { Migration } from './Migration';

export const migration007MqttRetainedMessages: Migration = {
  version: 7,
  name: 'mqtt_retained_messages',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mqtt_retained_messages (
        topic TEXT PRIMARY KEY,
        payload BLOB NOT NULL,
        qos INTEGER NOT NULL CHECK (qos BETWEEN 0 AND 2),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};
