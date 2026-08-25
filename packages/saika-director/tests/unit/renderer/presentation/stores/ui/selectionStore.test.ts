import { describe, it, expect, beforeEach } from 'vitest';
import { useSelectionStore } from '@/renderer/presentation/stores/ui/selection.store';

describe('useSelectionStore', () => {
  beforeEach(() => {
    useSelectionStore.getState().deselectAll();
  });

  describe('initial state', () => {
    it('should have empty selectedIds', () => {
      expect(useSelectionStore.getState().selectedIds).toBeInstanceOf(Set);
      expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    });
  });

  describe('toggleSelect', () => {
    it('should add id when not selected', () => {
      useSelectionStore.getState().toggleSelect('id-1');

      expect(useSelectionStore.getState().selectedIds.has('id-1')).toBe(true);
      expect(useSelectionStore.getState().selectedIds.size).toBe(1);
    });

    it('should remove id when already selected', () => {
      useSelectionStore.getState().toggleSelect('id-1');
      useSelectionStore.getState().toggleSelect('id-1');

      expect(useSelectionStore.getState().selectedIds.has('id-1')).toBe(false);
      expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    });

    it('should handle multiple toggles', () => {
      useSelectionStore.getState().toggleSelect('id-1');
      useSelectionStore.getState().toggleSelect('id-2');
      useSelectionStore.getState().toggleSelect('id-3');

      expect(useSelectionStore.getState().selectedIds.size).toBe(3);
    });

    it('should toggle specific id without affecting others', () => {
      useSelectionStore.getState().toggleSelect('id-1');
      useSelectionStore.getState().toggleSelect('id-2');
      useSelectionStore.getState().toggleSelect('id-1'); // remove id-1

      expect(useSelectionStore.getState().selectedIds.has('id-1')).toBe(false);
      expect(useSelectionStore.getState().selectedIds.has('id-2')).toBe(true);
    });
  });

  describe('selectAll', () => {
    it('should select all keys from map', () => {
      const map = new Map([
        ['id-1', { data: 1 }],
        ['id-2', { data: 2 }],
        ['id-3', { data: 3 }],
      ]);

      useSelectionStore.getState().selectAll(map);

      const selected = useSelectionStore.getState().selectedIds;
      expect(selected.size).toBe(3);
      expect(selected.has('id-1')).toBe(true);
      expect(selected.has('id-2')).toBe(true);
      expect(selected.has('id-3')).toBe(true);
    });

    it('should replace previous selection', () => {
      useSelectionStore.getState().toggleSelect('old-id');

      const map = new Map([['new-id', { data: 1 }]]);
      useSelectionStore.getState().selectAll(map);

      const selected = useSelectionStore.getState().selectedIds;
      expect(selected.size).toBe(1);
      expect(selected.has('new-id')).toBe(true);
      expect(selected.has('old-id')).toBe(false);
    });

    it('should handle empty map', () => {
      useSelectionStore.getState().toggleSelect('id-1');
      useSelectionStore.getState().selectAll(new Map());

      expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    });
  });

  describe('deselectAll', () => {
    it('should clear all selections', () => {
      useSelectionStore.getState().toggleSelect('id-1');
      useSelectionStore.getState().toggleSelect('id-2');

      useSelectionStore.getState().deselectAll();

      expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    });

    it('should be safe to call on empty selection', () => {
      useSelectionStore.getState().deselectAll();
      expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    });
  });

  describe('isSelected', () => {
    it('should return true for selected id', () => {
      useSelectionStore.getState().toggleSelect('id-1');

      expect(useSelectionStore.getState().isSelected('id-1')).toBe(true);
    });

    it('should return false for non-selected id', () => {
      expect(useSelectionStore.getState().isSelected('id-1')).toBe(false);
    });
  });

  describe('pruneSelection', () => {
    it('should remove ids not in valid map', () => {
      useSelectionStore.getState().toggleSelect('id-1');
      useSelectionStore.getState().toggleSelect('id-2');
      useSelectionStore.getState().toggleSelect('id-3');

      const validIds = new Map([
        ['id-1', {}],
        ['id-3', {}],
      ]);
      useSelectionStore.getState().pruneSelection(validIds);

      const selected = useSelectionStore.getState().selectedIds;
      expect(selected.size).toBe(2);
      expect(selected.has('id-1')).toBe(true);
      expect(selected.has('id-2')).toBe(false);
      expect(selected.has('id-3')).toBe(true);
    });

    it('should handle empty valid map', () => {
      useSelectionStore.getState().toggleSelect('id-1');

      useSelectionStore.getState().pruneSelection(new Map());

      expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    });

    it('should handle already empty selection', () => {
      const validIds = new Map([['id-1', {}]]);
      useSelectionStore.getState().pruneSelection(validIds);

      expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    });
  });
});
