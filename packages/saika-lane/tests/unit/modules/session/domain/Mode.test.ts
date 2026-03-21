// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { Mode } from '@/main/modules/session/domain/Mode';

describe('Mode value object', () => {
  describe('factory methods', () => {
    it('Mode.sighting() creates sighting mode', () => {
      const mode = Mode.sighting();
      expect(mode.value).toBe('SIGHTING');
      expect(mode.displayName).toBe('Sighting');
    });

    it('Mode.match() creates match mode', () => {
      const mode = Mode.match();
      expect(mode.value).toBe('MATCH');
      expect(mode.displayName).toBe('Match');
    });
  });

  describe('isSighting() method', () => {
    it('returns true in sighting mode', () => {
      const mode = Mode.sighting();
      expect(mode.isSighting()).toBe(true);
    });

    it('returns false in match mode', () => {
      const mode = Mode.match();
      expect(mode.isSighting()).toBe(false);
    });
  });

  describe('isMatch() method', () => {
    it('returns true in match mode', () => {
      const mode = Mode.match();
      expect(mode.isMatch()).toBe(true);
    });

    it('returns false in sighting mode', () => {
      const mode = Mode.sighting();
      expect(mode.isMatch()).toBe(false);
    });
  });

  describe('equals() method', () => {
    it('returns true when comparing two identical sighting modes', () => {
      const mode1 = Mode.sighting();
      const mode2 = Mode.sighting();
      expect(mode1.equals(mode2)).toBe(true);
    });

    it('returns true when comparing two identical match modes', () => {
      const mode1 = Mode.match();
      const mode2 = Mode.match();
      expect(mode1.equals(mode2)).toBe(true);
    });

    it('returns false when comparing sighting mode with match mode', () => {
      const mode1 = Mode.sighting();
      const mode2 = Mode.match();
      expect(mode1.equals(mode2)).toBe(false);
    });

    it('returns true when compared with itself', () => {
      const mode = Mode.sighting();
      expect(mode.equals(mode)).toBe(true);
    });
  });

  describe('immutability', () => {
    it('properties are read-only', () => {
      const mode = Mode.sighting();
      expect(() => {
        (mode as any).value = 'MATCH';
      }).toThrow();
    });
  });
});
