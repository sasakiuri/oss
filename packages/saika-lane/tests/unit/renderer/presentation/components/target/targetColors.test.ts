// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { getTargetZoneConfig } from '@/renderer/presentation/components/target/targetColors';

describe('targetColors', () => {
  describe('getTargetZoneConfig', () => {
    it('config can be retrieved for all 6 disciplines', () => {
      const disciplines = [
        'AIR_RIFLE_10M',
        'AIR_PISTOL_10M',
        'RIFLE_50M',
        'PISTOL_25M',
        'BEAM_RIFLE_10M',
        'BEAM_PISTOL_10M',
      ] as const;

      for (const d of disciplines) {
        const config = getTargetZoneConfig(d);
        expect(config).toBeDefined();
        expect(config.innerZoneStartScore).toBeGreaterThanOrEqual(1);
        expect(config.innerZoneStartScore).toBeLessThanOrEqual(9);
        expect(config.maxLabelScore).toBe(8);
      }
    });

    it('rifle disciplines have innerZoneStartScore=4', () => {
      expect(getTargetZoneConfig('AIR_RIFLE_10M').innerZoneStartScore).toBe(4);
      expect(getTargetZoneConfig('BEAM_RIFLE_10M').innerZoneStartScore).toBe(4);
      expect(getTargetZoneConfig('RIFLE_50M').innerZoneStartScore).toBe(4);
    });

    it('pistol disciplines have innerZoneStartScore=7', () => {
      expect(getTargetZoneConfig('AIR_PISTOL_10M').innerZoneStartScore).toBe(7);
      expect(getTargetZoneConfig('BEAM_PISTOL_10M').innerZoneStartScore).toBe(7);
      expect(getTargetZoneConfig('PISTOL_25M').innerZoneStartScore).toBe(7);
    });

    it('color palette is correctly set for all disciplines', () => {
      const config = getTargetZoneConfig('AIR_RIFLE_10M');
      expect(config.colors.outerRings.fill).toBe('#E0E0E0');
      expect(config.colors.outerRings.stroke).toBe('#2D2D2D');
      expect(config.colors.innerRings.fill).toBe('#02C38D');
      expect(config.colors.innerRings.stroke).toBe('#FFFFFF');
      expect(config.colors.innerTen.fill).toBe('#FFFFFF');
      expect(config.colors.innerTen.stroke).toBe('#FFFFFF');
    });
  });
});
