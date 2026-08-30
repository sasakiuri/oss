import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppConfigService } from '@/main/infrastructure/config/AppConfigService';

/**
 * AppConfigService unit tests
 *
 * better-sqlite3 is a native module and cannot be used directly here.
 * The database interface is mocked so only pure logic is tested.
 */

function createMockDb(rows: Record<string, string> = {}) {
  const store = new Map(Object.entries(rows));

  const getStmt = {
    get: vi.fn((key: string) => {
      const value = store.get(key);
      return value !== undefined ? { value } : undefined;
    }),
  };

  const upsertStmt = {
    run: vi.fn((_key: string, _value: string) => {
      store.set(_key, _value);
    }),
  };

  const deleteStmt = {
    run: vi.fn((key: string) => {
      store.delete(key);
    }),
  };

  const db = {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('SELECT')) return getStmt;
      if (sql.includes('INSERT')) return upsertStmt;
      if (sql.includes('DELETE')) return deleteStmt;
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
    transaction: vi.fn((callback: () => void) => () => {
      const snapshot = new Map(store);
      try {
        callback();
      } catch (error) {
        store.clear();
        for (const [key, value] of snapshot) store.set(key, value);
        throw error;
      }
    }),
    _store: store,
    _getStmt: getStmt,
    _upsertStmt: upsertStmt,
    _deleteStmt: deleteStmt,
  };

  return db;
}

describe('AppConfigService', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let service: AppConfigService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new AppConfigService(mockDb as any);
  });

  describe('get()', () => {
    it('should return default when key is not in DB', () => {
      expect(service.get('mqtt.broker.port')).toBe(1883);
      expect(service.get('mqtt.broker.url')).toBe('mqtt://localhost:1883');
      expect(service.get('mqtt.broker.mode')).toBe('embedded');
      expect(service.get('competitionAnnouncements.enabled')).toBe(true);
    });

    it('parses a persisted disabled announcement setting', () => {
      mockDb._store.set('competitionAnnouncements.enabled', 'false');

      expect(service.get('competitionAnnouncements.enabled')).toBe(false);
    });

    it('should coerce string port to number', () => {
      mockDb._store.set('mqtt.broker.port', '9999');
      expect(service.get('mqtt.broker.port')).toBe(9999);
    });

    it('should return stored string values as-is', () => {
      mockDb._store.set('mqtt.broker.url', 'mqtt://broker.example:2883');
      expect(service.get('mqtt.broker.url')).toBe('mqtt://broker.example:2883');
    });

    it('should replace an invalid persisted value with its safe default', () => {
      mockDb._store.set('mqtt.broker.url', 'https://legacy.example:1883');

      expect(service.get('mqtt.broker.url')).toBe('mqtt://localhost:1883');
      expect(mockDb._store.get('mqtt.broker.url')).toBe('mqtt://localhost:1883');
    });

    it('should return stored enum values', () => {
      mockDb._store.set('mqtt.broker.mode', 'external');
      expect(service.get('mqtt.broker.mode')).toBe('external');
    });

    it('should cache values after first read', () => {
      service.get('mqtt.broker.port');
      service.get('mqtt.broker.port');

      // prepare is called once per get (first call), second call uses cache
      const selectCalls = mockDb.prepare.mock.calls.filter((c) => typeof c[0] === 'string' && c[0].includes('SELECT'));
      expect(selectCalls).toHaveLength(1);
    });
  });

  describe('set()', () => {
    it('should write port as string to DB', () => {
      service.set('mqtt.broker.port', 2883);
      expect(mockDb._upsertStmt.run).toHaveBeenCalledWith('mqtt.broker.port', '2883');
    });

    it('should write url to DB', () => {
      service.set('mqtt.broker.url', 'mqtt://custom:1234');
      expect(mockDb._upsertStmt.run).toHaveBeenCalledWith('mqtt.broker.url', 'mqtt://custom:1234');
    });

    it('should persist and cache the normalized URL', () => {
      service.set('mqtt.broker.url', '  mqtt://custom:1234  ');
      expect(mockDb._upsertStmt.run).toHaveBeenCalledWith('mqtt.broker.url', 'mqtt://custom:1234');
      expect(service.get('mqtt.broker.url')).toBe('mqtt://custom:1234');
    });

    it('should write mode to DB', () => {
      service.set('mqtt.broker.mode', 'external');
      expect(mockDb._upsertStmt.run).toHaveBeenCalledWith('mqtt.broker.mode', 'external');
    });

    it('should update cache after set', () => {
      service.set('mqtt.broker.port', 5555);
      expect(service.get('mqtt.broker.port')).toBe(5555);

      // Only one SELECT call (the prepare for INSERT), no SELECT needed
      const selectCalls = mockDb.prepare.mock.calls.filter((c) => typeof c[0] === 'string' && c[0].includes('SELECT'));
      expect(selectCalls).toHaveLength(0);
    });

    it('should reject invalid port value', () => {
      expect(() => service.set('mqtt.broker.port', 0)).toThrow();
      expect(() => service.set('mqtt.broker.port', 70000)).toThrow();
    });

    it('should reject invalid mode value', () => {
      expect(() => service.set('mqtt.broker.mode', 'invalid' as any)).toThrow();
    });
  });

  describe('setMany()', () => {
    it('should validate and write all settings in one transaction', () => {
      service.setMany({
        'mqtt.broker.mode': 'external',
        'mqtt.broker.url': 'mqtt://broker.local:2883',
        'mqtt.broker.port': 2883,
      });

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockDb._store).toEqual(
        new Map([
          ['mqtt.broker.mode', 'external'],
          ['mqtt.broker.url', 'mqtt://broker.local:2883'],
          ['mqtt.broker.port', '2883'],
        ]),
      );
      expect(service.get('mqtt.broker.mode')).toBe('external');
    });

    it('should not write anything when one value is invalid', () => {
      expect(() =>
        service.setMany({
          'mqtt.broker.mode': 'external',
          'mqtt.broker.url': 'https://not-mqtt.example',
        }),
      ).toThrow();

      expect(mockDb.transaction).not.toHaveBeenCalled();
      expect(mockDb._store.size).toBe(0);
    });

    it('should leave the cache unchanged when the transaction fails', () => {
      mockDb._upsertStmt.run.mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      expect(() => service.setMany({ 'mqtt.broker.mode': 'external' })).toThrow('disk full');
      expect(mockDb._store.size).toBe(0);
      expect(service.get('mqtt.broker.mode')).toBe('embedded');
    });
  });

  describe('delete()', () => {
    it('should delete from DB and clear cache', () => {
      service.set('mqtt.broker.port', 2883);
      service.delete('mqtt.broker.port');
      expect(mockDb._deleteStmt.run).toHaveBeenCalledWith('mqtt.broker.port');

      // After delete, next get should query DB again and return default
      expect(service.get('mqtt.broker.port')).toBe(1883);
    });
  });

  describe('clearCache()', () => {
    it('should force re-read from DB on next get', () => {
      service.get('mqtt.broker.port'); // cached
      service.clearCache();
      service.get('mqtt.broker.port'); // re-read

      const selectCalls = mockDb.prepare.mock.calls.filter((c) => typeof c[0] === 'string' && c[0].includes('SELECT'));
      expect(selectCalls).toHaveLength(2);
    });
  });
});
