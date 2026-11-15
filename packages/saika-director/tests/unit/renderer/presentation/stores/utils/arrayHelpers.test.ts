import { describe, it, expect } from 'vitest';
import { addWithLimit, addManyWithLimit } from '@/renderer/presentation/stores/utils/arrayHelpers';

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
