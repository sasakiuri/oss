import type Database from 'better-sqlite3';

export interface RetainedMqttMessage {
  topic: string;
  payload: Buffer;
  qos: 0 | 1 | 2;
}

export interface MqttRetainedMessageStore {
  loadAll(): RetainedMqttMessage[];
  apply(message: RetainedMqttMessage & { retain: boolean }): void;
}

interface RetainedMqttMessageRow {
  topic: string;
  payload: Buffer;
  qos: number;
}

export class SqliteMqttRetainedMessageStore implements MqttRetainedMessageStore {
  constructor(private readonly db: Database.Database) {}

  loadAll(): RetainedMqttMessage[] {
    const rows = this.db
      .prepare('SELECT topic, payload, qos FROM mqtt_retained_messages ORDER BY topic')
      .all() as RetainedMqttMessageRow[];
    return rows.map((row) => {
      if (row.qos !== 0 && row.qos !== 1 && row.qos !== 2) {
        throw new Error(`Invalid retained MQTT QoS ${row.qos} for topic ${row.topic}`);
      }
      return {
        topic: row.topic,
        payload: Buffer.from(row.payload),
        qos: row.qos,
      };
    });
  }

  apply(message: RetainedMqttMessage & { retain: boolean }): void {
    if (!message.retain) return;
    if (message.payload.length === 0) {
      this.db.prepare('DELETE FROM mqtt_retained_messages WHERE topic = ?').run(message.topic);
      return;
    }

    this.db
      .prepare(
        `INSERT INTO mqtt_retained_messages (topic, payload, qos, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(topic) DO UPDATE SET
           payload = excluded.payload,
           qos = excluded.qos,
           updated_at = excluded.updated_at`,
      )
      .run(message.topic, message.payload, message.qos);
  }
}
