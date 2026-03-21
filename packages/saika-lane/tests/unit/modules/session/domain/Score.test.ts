// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { Score } from '@/main/modules/session/domain/Score';

describe('Score value object', () => {
  describe('creating valid scores', () => {
    it('creates a Score of 0', () => {
      const score = new Score(0);
      expect(score.value).toBe(0);
    });

    it('creates a Score of 55 (5.5×10)', () => {
      const score = new Score(55);
      expect(score.value).toBe(55);
    });

    it('creates a Score of 109 (10.9×10)', () => {
      const score = new Score(109);
      expect(score.value).toBe(109);
    });

    it('creates a Score of 100 (10.0×10)', () => {
      const score = new Score(100);
      expect(score.value).toBe(100);
    });

    it('creates a Score of 98 (9.8×10)', () => {
      const score = new Score(98);
      expect(score.value).toBe(98);
    });
  });

  describe('isInner() method', () => {
    it('returns true for 109', () => {
      const score = new Score(109);
      expect(score.isInner()).toBe(true);
    });

    it('returns false for 108', () => {
      const score = new Score(108);
      expect(score.isInner()).toBe(false);
    });

    it('returns false for 100', () => {
      const score = new Score(100);
      expect(score.isInner()).toBe(false);
    });

    it('returns false for 0', () => {
      const score = new Score(0);
      expect(score.isInner()).toBe(false);
    });
  });

  describe('equals() method', () => {
    it('returns true when two Scores have the same value', () => {
      const score1 = new Score(105);
      const score2 = new Score(105);
      expect(score1.equals(score2)).toBe(true);
    });

    it('returns false when two Scores have different values', () => {
      const score1 = new Score(105);
      const score2 = new Score(104);
      expect(score1.equals(score2)).toBe(false);
    });

    it('returns true when comparing two Scores of 0', () => {
      const score1 = new Score(0);
      const score2 = new Score(0);
      expect(score1.equals(score2)).toBe(true);
    });
  });

  describe('compareTo() method', () => {
    it('returns a negative number when compared to a larger Score', () => {
      const score1 = new Score(95);
      const score2 = new Score(100);
      expect(score1.compareTo(score2)).toBeLessThan(0);
    });

    it('returns a positive number when compared to a smaller Score', () => {
      const score1 = new Score(100);
      const score2 = new Score(95);
      expect(score1.compareTo(score2)).toBeGreaterThan(0);
    });

    it('returns 0 when compared to an equal Score', () => {
      const score1 = new Score(100);
      const score2 = new Score(100);
      expect(score1.compareTo(score2)).toBe(0);
    });
  });

  describe('static method: Score.zero()', () => {
    it('creates a Score instance of 0', () => {
      const score = Score.zero();
      expect(score.value).toBe(0);
    });

    it('Score.zero() instance returns false for isInner()', () => {
      const score = Score.zero();
      expect(score.isInner()).toBe(false);
    });
  });

  describe('static method: Score.miss()', () => {
    it('creates a miss (0) Score instance', () => {
      const score = Score.miss();
      expect(score.value).toBe(0);
    });

    it('Score.miss() and Score.zero() are equivalent', () => {
      const miss = Score.miss();
      const zero = Score.zero();
      expect(miss.equals(zero)).toBe(true);
    });
  });

  describe('errors for out-of-range values', () => {
    it('throws when specifying a negative number (-1)', () => {
      expect(() => new Score(-1)).toThrow();
    });

    it('throws when specifying a value above the range (110)', () => {
      expect(() => new Score(110)).toThrow();
    });

    it('throws when specifying a value above the range (1000)', () => {
      expect(() => new Score(1000)).toThrow();
    });

    it('throws when specifying a non-integer (10.5)', () => {
      expect(() => new Score(10.5)).toThrow();
    });
  });

  describe('errors for invalid values', () => {
    it('throws when specifying NaN', () => {
      expect(() => new Score(NaN)).toThrow();
    });

    it('throws when specifying Infinity', () => {
      expect(() => new Score(Infinity)).toThrow();
    });

    it('throws when specifying -Infinity', () => {
      expect(() => new Score(-Infinity)).toThrow();
    });
  });

  describe('immutability', () => {
    it('properties are read-only', () => {
      const score = new Score(100);
      expect(() => {
        (score as any).value = 50;
      }).toThrow();
    });
  });

  describe('toString() method', () => {
    it('displays 109 as "10.9"', () => {
      const score = new Score(109);
      expect(score.toString()).toBe('10.9');
    });

    it('displays 100 as "10.0"', () => {
      const score = new Score(100);
      expect(score.toString()).toBe('10.0');
    });

    it('displays 0 as "0.0"', () => {
      const score = new Score(0);
      expect(score.toString()).toBe('0.0');
    });

    it('displays 95 as "9.5"', () => {
      const score = new Score(95);
      expect(score.toString()).toBe('9.5');
    });
  });
});
