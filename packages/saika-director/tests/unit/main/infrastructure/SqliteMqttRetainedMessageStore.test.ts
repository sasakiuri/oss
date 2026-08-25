import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration007MqttRetainedMessages } from '@/main/infrastructure/database/migrations/007_mqtt_retained_messages';
import { SqliteMqttRetainedMessageStore } from '@/main/modules/mqtt/infra/SqliteMqttRetainedMessageStore';

describe('SqliteMqttRetainedMessageStore', () => {
  let database: Database.Database;
  let store: SqliteMqttRetainedMessageStore;

  beforeEach(() => {
    database = new Database(':memory:');
    migration007MqttRetainedMessages.up(database);
    store = new SqliteMqttRetainedMessageStore(database);
  });

  afterEach(() => database.close());

  it('persists and replaces retained messages', () => {
    store.apply({ topic: 'saika/test', payload: Buffer.from('first'), qos: 0, retain: true });
    store.apply({ topic: 'saika/test', payload: Buffer.from('second'), qos: 1, retain: true });

    expect(store.loadAll()).toEqual([{ topic: 'saika/test', payload: Buffer.from('second'), qos: 1 }]);
  });

  it('deletes a retained message when an empty retained payload is published', () => {
    store.apply({ topic: 'saika/test', payload: Buffer.from('value'), qos: 1, retain: true });

    store.apply({ topic: 'saika/test', payload: Buffer.alloc(0), qos: 1, retain: true });

    expect(store.loadAll()).toEqual([]);
  });

  it('ignores messages that are not retained', () => {
    store.apply({ topic: 'saika/test', payload: Buffer.from('value'), qos: 1, retain: false });

    expect(store.loadAll()).toEqual([]);
  });
});
