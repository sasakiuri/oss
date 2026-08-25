import { describe, it, expect } from 'vitest';
import {
  createMapFromArray,
  setInMap,
  patchInMap,
  deleteFromMap,
  clearMap,
  mapToArray,
  toggleInSet,
  selectAllFromMap,
  clearSelection,
  addWithLimit,
  addManyWithLimit,
  createPatchResult,
} from '@/renderer/presentation/stores/utils';

describe('mapHelpers', () => {
  describe('createMapFromArray', () => {
    it('should create a map from an array of entities with id', () => {
      const entities = [
        { id: '1', name: 'A' },
        { id: '2', name: 'B' },
      ];
      const map = createMapFromArray(entities);
      expect(map.size).toBe(2);
      expect(map.get('1')).toEqual({ id: '1', name: 'A' });
      expect(map.get('2')).toEqual({ id: '2', name: 'B' });
    });

    it('should use custom key function', () => {
      const entities = [
        { code: 'a', value: 1 },
        { code: 'b', value: 2 },
      ];
      const map = createMapFromArray(entities, (e) => e.code);
      expect(map.get('a')).toEqual({ code: 'a', value: 1 });
    });
  });

  describe('setInMap', () => {
    it('should set a value in map immutably', () => {
      const original = new Map([['1', { id: '1', name: 'A' }]]);
      const updated = setInMap(original, '2', { id: '2', name: 'B' });

      expect(original.size).toBe(1);
      expect(updated.size).toBe(2);
      expect(updated.get('2')).toEqual({ id: '2', name: 'B' });
    });

    it('should update existing value', () => {
      const original = new Map([['1', { id: '1', name: 'A' }]]);
      const updated = setInMap(original, '1', { id: '1', name: 'Updated' });

      expect(original.get('1')?.name).toBe('A');
      expect(updated.get('1')?.name).toBe('Updated');
    });
  });

  describe('patchInMap', () => {
    it('should patch existing entry', () => {
      const map = new Map([['1', { id: '1', name: 'A', value: 10 }]]);
      const result = patchInMap(map, '1', { value: 20 });

      expect(result.success).toBe(true);
      expect(result.map.get('1')).toEqual({ id: '1', name: 'A', value: 20 });
      expect(result.previous).toEqual({ id: '1', name: 'A', value: 10 });
    });

    it('should return failure for non-existent key', () => {
      const map = new Map([['1', { id: '1', name: 'A' }]]);
      const result = patchInMap(map, 'non-existent', { name: 'B' });

      expect(result.success).toBe(false);
      expect(result.previous).toBeUndefined();
    });
  });

  describe('deleteFromMap', () => {
    it('should delete entry immutably', () => {
      const original = new Map([
        ['1', { id: '1' }],
        ['2', { id: '2' }],
      ]);
      const updated = deleteFromMap(original, '1');

      expect(original.size).toBe(2);
      expect(updated.size).toBe(1);
      expect(updated.has('1')).toBe(false);
    });
  });

  describe('clearMap', () => {
    it('should return empty map', () => {
      const map = clearMap<string, object>();
      expect(map.size).toBe(0);
    });
  });

  describe('mapToArray', () => {
    it('should convert map values to array', () => {
      const map = new Map([
        ['1', { id: '1', name: 'A' }],
        ['2', { id: '2', name: 'B' }],
      ]);
      const array = mapToArray(map);
      expect(array).toHaveLength(2);
      expect(array).toContainEqual({ id: '1', name: 'A' });
      expect(array).toContainEqual({ id: '2', name: 'B' });
    });
  });
});

describe('selection helpers', () => {
  describe('toggleInSet', () => {
    it('should add item if not present', () => {
      const original = new Set(['a', 'b']);
      const updated = toggleInSet(original, 'c');

      expect(original.size).toBe(2);
      expect(updated.size).toBe(3);
      expect(updated.has('c')).toBe(true);
    });

    it('should remove item if present', () => {
      const original = new Set(['a', 'b']);
      const updated = toggleInSet(original, 'a');

      expect(original.size).toBe(2);
      expect(updated.size).toBe(1);
      expect(updated.has('a')).toBe(false);
    });
  });

  describe('selectAllFromMap', () => {
    it('should create set from map keys', () => {
      const map = new Map([
        ['1', { id: '1' }],
        ['2', { id: '2' }],
      ]);
      const selected = selectAllFromMap(map);
      expect(selected.size).toBe(2);
      expect(selected.has('1')).toBe(true);
      expect(selected.has('2')).toBe(true);
    });
  });

  describe('clearSelection', () => {
    it('should return empty set', () => {
      const set = clearSelection<string>();
      expect(set.size).toBe(0);
    });
  });
});

describe('array helpers', () => {
  describe('addWithLimit', () => {
    it('should add item within limit', () => {
      const array = [1, 2, 3];
      const result = addWithLimit(array, 4, 5);
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('should remove oldest when exceeding limit', () => {
      const array = [1, 2, 3, 4, 5];
      const result = addWithLimit(array, 6, 5);
      expect(result).toEqual([2, 3, 4, 5, 6]);
    });
  });

  describe('addManyWithLimit', () => {
    it('should add multiple items within limit', () => {
      const array = [1, 2];
      const result = addManyWithLimit(array, [3, 4], 5);
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('should remove oldest when exceeding limit', () => {
      const array = [1, 2, 3];
      const result = addManyWithLimit(array, [4, 5, 6], 4);
      expect(result).toEqual([3, 4, 5, 6]);
    });
  });
});

describe('createPatchResult', () => {
  it('should create successful result', () => {
    const result = createPatchResult(true);
    expect(result.applied).toBe(true);
    expect(result.needsFullSync).toBe(false);
  });

  it('should create failed result with sync flag', () => {
    const result = createPatchResult(false, true);
    expect(result.applied).toBe(false);
    expect(result.needsFullSync).toBe(true);
  });
});
