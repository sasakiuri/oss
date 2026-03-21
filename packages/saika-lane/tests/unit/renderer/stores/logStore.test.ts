// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from 'vitest';

import { useLogStore } from '@/renderer/presentation/stores/logStore';
import type { LogEntry, LogLevel, LogSource } from '@/shared/types/log';

/**
 * Helper function to generate a LogEntry for testing
 */
function createLogEntry(overrides?: Partial<LogEntry>, index: number = 1): LogEntry {
  return {
    id: `log-${index}`,
    timestamp: new Date(Date.UTC(2026, 0, 14, 10, index, 0)).toISOString(),
    level: 'info',
    message: `Test log message ${index}`,
    source: 'renderer',
    ...overrides,
  };
}

describe('logStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    const { clearEntries, setAutoScroll } = useLogStore.getState();
    clearEntries();
    setAutoScroll(true);
  });

  describe('initial state', () => {
    it('entries is an empty array', () => {
      const { entries } = useLogStore.getState();
      expect(entries).toEqual([]);
      expect(entries).toHaveLength(0);
    });

    it('autoScroll is true', () => {
      const { autoScroll } = useLogStore.getState();
      expect(autoScroll).toBe(true);
    });

    it('initial state is set correctly', () => {
      const state = useLogStore.getState();
      expect(state.entries).toEqual([]);
      expect(state.autoScroll).toBe(true);
    });
  });

  describe('addEntry', () => {
    it('can add a log entry', () => {
      const { addEntry } = useLogStore.getState();
      const entry = createLogEntry();

      addEntry(entry);

      const { entries } = useLogStore.getState();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(entry);
    });

    it('can add multiple log entries', () => {
      const { addEntry } = useLogStore.getState();
      const entry1 = createLogEntry({ level: 'info' }, 1);
      const entry2 = createLogEntry({ level: 'warn' }, 2);
      const entry3 = createLogEntry({ level: 'error' }, 3);

      addEntry(entry1);
      addEntry(entry2);
      addEntry(entry3);

      const { entries } = useLogStore.getState();
      expect(entries).toHaveLength(3);
      expect(entries[0]).toEqual(entry1);
      expect(entries[1]).toEqual(entry2);
      expect(entries[2]).toEqual(entry3);
    });

    it('does not mutate existing entries array when adding (immutability)', () => {
      const { addEntry, entries: initialEntries } = useLogStore.getState();
      const entry = createLogEntry();

      addEntry(entry);

      const { entries: newEntries } = useLogStore.getState();
      expect(newEntries).not.toBe(initialEntries);
      expect(initialEntries).toHaveLength(0);
      expect(newEntries).toHaveLength(1);
    });
  });

  describe('MAX_LOG_ENTRIES limit', () => {
    it('retains all 1000 entries', () => {
      const { addEntry } = useLogStore.getState();

      // Add 1000 logs
      for (let i = 1; i <= 1000; i++) {
        addEntry(createLogEntry({ message: `Log ${i}` }, i));
      }

      const { entries } = useLogStore.getState();
      expect(entries).toHaveLength(1000);
      expect(entries[0]!.message).toBe('Log 1');
      expect(entries[999]!.message).toBe('Log 1000');
    });

    it('removes the oldest entry when 1001 entries are added', () => {
      const { addEntry } = useLogStore.getState();

      // Add 1001 logs
      for (let i = 1; i <= 1001; i++) {
        addEntry(createLogEntry({ message: `Log ${i}` }, i));
      }

      const { entries } = useLogStore.getState();
      expect(entries).toHaveLength(1000);
      // First entry is removed, second entry becomes first
      expect(entries[0]!.message).toBe('Log 2');
      expect(entries[999]!.message).toBe('Log 1001');
    });

    it('retains only the latest 1000 entries when 2000 are added', () => {
      const { addEntry } = useLogStore.getState();

      // Add 2000 logs
      for (let i = 1; i <= 2000; i++) {
        addEntry(createLogEntry({ message: `Log ${i}` }, i));
      }

      const { entries } = useLogStore.getState();
      expect(entries).toHaveLength(1000);
      // First 1000 are removed, 1001-2000 are retained
      expect(entries[0]!.message).toBe('Log 1001');
      expect(entries[999]!.message).toBe('Log 2000');
    });
  });

  describe('clearEntries', () => {
    it('can clear all log entries', () => {
      const { addEntry, clearEntries } = useLogStore.getState();

      // Add logs
      addEntry(createLogEntry({}, 1));
      addEntry(createLogEntry({}, 2));
      addEntry(createLogEntry({}, 3));

      // Execute clear
      clearEntries();

      const { entries } = useLogStore.getState();
      expect(entries).toEqual([]);
      expect(entries).toHaveLength(0);
    });

    it('clearing logs does not change autoScroll', () => {
      const { addEntry, clearEntries, setAutoScroll } = useLogStore.getState();

      // Set autoScroll to false
      setAutoScroll(false);

      // Add logs
      addEntry(createLogEntry({}, 1));
      addEntry(createLogEntry({}, 2));

      // Execute clear
      clearEntries();

      const state = useLogStore.getState();
      expect(state.entries).toEqual([]);
      expect(state.autoScroll).toBe(false);
    });
  });

  describe('setAutoScroll', () => {
    it('can set autoScroll to false', () => {
      const { setAutoScroll } = useLogStore.getState();

      setAutoScroll(false);

      const { autoScroll } = useLogStore.getState();
      expect(autoScroll).toBe(false);
    });

    it('can set autoScroll back to true', () => {
      const { setAutoScroll } = useLogStore.getState();

      setAutoScroll(false);
      setAutoScroll(true);

      const { autoScroll } = useLogStore.getState();
      expect(autoScroll).toBe(true);
    });

    it('changing autoScroll does not change entries', () => {
      const { addEntry, setAutoScroll } = useLogStore.getState();

      addEntry(createLogEntry({}, 1));
      addEntry(createLogEntry({}, 2));

      const { entries: entriesBeforeToggle } = useLogStore.getState();

      setAutoScroll(false);

      const { entries: entriesAfterToggle } = useLogStore.getState();
      expect(entriesAfterToggle).toEqual(entriesBeforeToggle);
      expect(entriesAfterToggle).toHaveLength(2);
    });
  });

  describe('integration scenarios', () => {
    it('add logs -> clear -> re-add flow works correctly', () => {
      const { addEntry, clearEntries } = useLogStore.getState();

      // First log addition
      addEntry(createLogEntry({ message: 'First log' }, 1));
      addEntry(createLogEntry({ message: 'Second log' }, 2));

      let state = useLogStore.getState();
      expect(state.entries).toHaveLength(2);
      expect(state.entries[0]!.message).toBe('First log');
      expect(state.entries[1]!.message).toBe('Second log');

      // Clear
      clearEntries();

      state = useLogStore.getState();
      expect(state.entries).toHaveLength(0);

      // Add logs again
      addEntry(createLogEntry({ message: 'Third log' }, 3));

      state = useLogStore.getState();
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0]!.message).toBe('Third log');
    });

    it('add 1001 -> clear -> re-add flow works correctly', () => {
      const { addEntry, clearEntries } = useLogStore.getState();

      // Add 1001 logs
      for (let i = 1; i <= 1001; i++) {
        addEntry(createLogEntry({ message: `Log ${i}` }, i));
      }

      let state = useLogStore.getState();
      expect(state.entries).toHaveLength(1000);
      expect(state.entries[0]!.message).toBe('Log 2');
      expect(state.entries[999]!.message).toBe('Log 1001');

      // Clear
      clearEntries();

      state = useLogStore.getState();
      expect(state.entries).toHaveLength(0);

      // Add new log
      addEntry(createLogEntry({ message: 'New log after clear' }, 1));

      state = useLogStore.getState();
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0]!.message).toBe('New log after clear');
    });

    it('autoScroll toggle -> add logs -> clear flow works correctly', () => {
      const { addEntry, setAutoScroll, clearEntries } = useLogStore.getState();

      // Set autoScroll to false
      setAutoScroll(false);

      // Add logs
      addEntry(createLogEntry({ level: 'info' }, 1));
      addEntry(createLogEntry({ level: 'warn' }, 2));
      addEntry(createLogEntry({ level: 'error' }, 3));

      let state = useLogStore.getState();
      expect(state.entries).toHaveLength(3);
      expect(state.autoScroll).toBe(false);

      // Set autoScroll back to true
      setAutoScroll(true);

      state = useLogStore.getState();
      expect(state.entries).toHaveLength(3);
      expect(state.autoScroll).toBe(true);

      // Clear
      clearEntries();

      state = useLogStore.getState();
      expect(state.entries).toHaveLength(0);
      expect(state.autoScroll).toBe(true);
    });
  });

  describe('various log levels', () => {
    it('can add entries for all log levels', () => {
      const { addEntry } = useLogStore.getState();
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

      levels.forEach((level, index) => {
        addEntry(
          createLogEntry(
            {
              level,
              message: `${level} message`,
            },
            index + 1,
          ),
        );
      });

      const { entries } = useLogStore.getState();
      expect(entries).toHaveLength(4);
      expect(entries[0]!.level).toBe('debug');
      expect(entries[1]!.level).toBe('info');
      expect(entries[2]!.level).toBe('warn');
      expect(entries[3]!.level).toBe('error');
    });
  });

  describe('various log sources', () => {
    it('can add entries for all log sources', () => {
      const { addEntry } = useLogStore.getState();
      const sources: LogSource[] = ['main', 'ipc', 'usb', 'domain', 'cqrs', 'module', 'renderer'];

      sources.forEach((source, index) => {
        addEntry(
          createLogEntry(
            {
              source,
              message: `${source} message`,
            },
            index + 1,
          ),
        );
      });

      const { entries } = useLogStore.getState();
      expect(entries).toHaveLength(7);
      expect(entries[0]!.source).toBe('main');
      expect(entries[1]!.source).toBe('ipc');
      expect(entries[2]!.source).toBe('usb');
      expect(entries[3]!.source).toBe('domain');
      expect(entries[4]!.source).toBe('cqrs');
      expect(entries[5]!.source).toBe('module');
      expect(entries[6]!.source).toBe('renderer');
    });
  });

  describe('log entries with metadata', () => {
    it('can add log entry with metadata', () => {
      const { addEntry } = useLogStore.getState();
      const entry = createLogEntry({
        message: 'Error occurred',
        level: 'error',
        metadata: {
          errorCode: 'USB_001',
          deviceId: 'MT201',
          timestamp: Date.now(),
        },
      });

      addEntry(entry);

      const { entries } = useLogStore.getState();
      expect(entries).toHaveLength(1);
      const meta = entries[0]!.metadata;
      expect(meta).toBeDefined();
      expect(meta!.errorCode).toBe('USB_001');
      expect(meta!.deviceId).toBe('MT201');
    });

    it('can add log entry without metadata', () => {
      const { addEntry } = useLogStore.getState();
      const { metadata: _, ...entryWithoutMeta } = createLogEntry({
        message: 'Simple log',
      });

      addEntry(entryWithoutMeta as LogEntry);

      const { entries } = useLogStore.getState();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.metadata).toBeUndefined();
    });
  });
});
