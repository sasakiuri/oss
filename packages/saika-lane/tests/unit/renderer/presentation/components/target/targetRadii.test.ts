// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { getTargetRadii, TARGET_RADII } from '@/renderer/presentation/components/target/targetRadii';

describe('targetRadii', () => {
  describe('TARGET_RADII', () => {
    it('data exists for all 6 disciplines', () => {
      expect(TARGET_RADII.AIR_RIFLE_10M).toBeDefined();
      expect(TARGET_RADII.AIR_PISTOL_10M).toBeDefined();
      expect(TARGET_RADII.BEAM_RIFLE_10M).toBeDefined();
      expect(TARGET_RADII.BEAM_PISTOL_10M).toEqual(TARGET_RADII.AIR_PISTOL_10M);
      expect(TARGET_RADII.RIFLE_50M).toBeDefined();
      expect(TARGET_RADII.PISTOL_25M).toBeDefined();
    });

    it('each discipline has data for scores 10 through 1', () => {
      for (const discipline of Object.keys(TARGET_RADII)) {
        const radii = TARGET_RADII[discipline as keyof typeof TARGET_RADII];
        for (let score = 1; score <= 10; score++) {
          expect(radii[score]).toBeDefined();
          expect(radii[score]).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('getTargetRadii', () => {
    it('returns radii data for a valid discipline', () => {
      const radii = getTargetRadii('AIR_RIFLE_10M');
      expect(radii).toBeDefined();
      expect(radii[10]).toBe(0.25);
    });

    it('throws an error for an unknown discipline', () => {
      expect(() => getTargetRadii('UNKNOWN' as any)).toThrow('Unknown discipline: UNKNOWN');
    });
  });
});
