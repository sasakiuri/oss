import { describe, it, expect, beforeEach } from 'vitest';
import { useDebugStore } from '@/renderer/presentation/stores/system/debug.store';
import type { DebugLogEntry } from '@/shared/ipc/contracts/debug.contract';

function createDebugEntry(overrides: Partial<DebugLogEntry> = {}): DebugLogEntry {
  return {
    timestamp: Date.now(),
    direction: 'LOG',
    raw: 'test log message',
    parsed: undefined,
    ...overrides,
  };
}

describe('useDebugStore', () => {
  beforeEach(() => {
    useDebugStore.getState().clear();
    useDebugStore.setState({ isVisible: false, activeTab: 'ALL' });
  });

  describe('initial state', () => {
    it('should have empty entries', () => {
      expect(useDebugStore.getState().entries).toEqual([]);
    });

    it('should have isVisible as false', () => {
      expect(useDebugStore.getState().isVisible).toBe(false);
    });

    it('should have activeTab as ALL', () => {
      expect(useDebugStore.getState().activeTab).toBe('ALL');
    });
  });

  describe('addEntry', () => {
    it('should add single entry', () => {
      const entry = createDebugEntry({ raw: 'entry-1' });
      useDebugStore.getState().addEntry(entry);

      expect(useDebugStore.getState().entries).toHaveLength(1);
      expect(useDebugStore.getState().entries[0]!.raw).toBe('entry-1');
    });

    it('should append entries', () => {
      useDebugStore.getState().addEntry(createDebugEntry({ raw: 'first' }));
      useDebugStore.getState().addEntry(createDebugEntry({ raw: 'second' }));

      expect(useDebugStore.getState().entries).toHaveLength(2);
      expect(useDebugStore.getState().entries[0]!.raw).toBe('first');
      expect(useDebugStore.getState().entries[1]!.raw).toBe('second');
    });

    it('should limit to 200 entries', () => {
      for (let i = 0; i < 210; i++) {
        useDebugStore.getState().addEntry(createDebugEntry({ raw: `entry-${i}` }));
      }

      expect(useDebugStore.getState().entries).toHaveLength(200);
      // Oldest entries should be removed (0-9 dropped, 10-209 remain)
      expect(useDebugStore.getState().entries[0]!.raw).toBe('entry-10');
    });
  });

  describe('setEntries', () => {
    it('should set entries', () => {
      const entries = [createDebugEntry({ raw: 'a' }), createDebugEntry({ raw: 'b' })];
      useDebugStore.getState().setEntries(entries);

      expect(useDebugStore.getState().entries).toHaveLength(2);
    });

    it('should replace existing entries', () => {
      useDebugStore.getState().addEntry(createDebugEntry({ raw: 'old' }));

      useDebugStore.getState().setEntries([createDebugEntry({ raw: 'new' })]);

      expect(useDebugStore.getState().entries).toHaveLength(1);
      expect(useDebugStore.getState().entries[0]!.raw).toBe('new');
    });

    it('should limit to 200 entries on set', () => {
      const entries = Array.from({ length: 250 }, (_, i) => createDebugEntry({ raw: `entry-${i}` }));
      useDebugStore.getState().setEntries(entries);

      expect(useDebugStore.getState().entries).toHaveLength(200);
    });
  });

  describe('toggleVisibility', () => {
    it('should toggle from false to true', () => {
      useDebugStore.getState().toggleVisibility();
      expect(useDebugStore.getState().isVisible).toBe(true);
    });

    it('should toggle from true to false', () => {
      useDebugStore.getState().toggleVisibility();
      useDebugStore.getState().toggleVisibility();
      expect(useDebugStore.getState().isVisible).toBe(false);
    });
  });

  describe('setActiveTab', () => {
    it('should set active tab to TX', () => {
      useDebugStore.getState().setActiveTab('TX');
      expect(useDebugStore.getState().activeTab).toBe('TX');
    });

    it('should set active tab to RX', () => {
      useDebugStore.getState().setActiveTab('RX');
      expect(useDebugStore.getState().activeTab).toBe('RX');
    });

    it('should set active tab to LOG', () => {
      useDebugStore.getState().setActiveTab('LOG');
      expect(useDebugStore.getState().activeTab).toBe('LOG');
    });

    it('should set active tab to ALL', () => {
      useDebugStore.getState().setActiveTab('TX');
      useDebugStore.getState().setActiveTab('ALL');
      expect(useDebugStore.getState().activeTab).toBe('ALL');
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      useDebugStore.getState().addEntry(createDebugEntry());
      useDebugStore.getState().addEntry(createDebugEntry());

      useDebugStore.getState().clear();

      expect(useDebugStore.getState().entries).toEqual([]);
    });

    it('should not affect visibility or tab', () => {
      useDebugStore.getState().toggleVisibility();
      useDebugStore.getState().setActiveTab('TX');
      useDebugStore.getState().addEntry(createDebugEntry());

      useDebugStore.getState().clear();

      expect(useDebugStore.getState().isVisible).toBe(true);
      expect(useDebugStore.getState().activeTab).toBe('TX');
    });
  });
});
