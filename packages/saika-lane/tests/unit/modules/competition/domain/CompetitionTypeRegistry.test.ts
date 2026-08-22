// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from 'vitest';

import type { CompetitionTypeDefinition } from '@/main/modules/competition/domain/CompetitionTypeDefinition';
import { CompetitionTypeRegistry } from '@/main/modules/competition/domain/CompetitionTypeRegistry';
import { ALL_COMPETITION_TYPES, AP60, AR60, BP60, BR60S } from '@/main/modules/competition/domain/competitionTypes';

describe('CompetitionTypeRegistry', () => {
  let registry: CompetitionTypeRegistry;

  beforeEach(() => {
    registry = new CompetitionTypeRegistry();
  });

  describe('register()', () => {
    it('can register a competition type', () => {
      registry.register(BR60S);
      expect(registry.get('BR60S')).toBe(BR60S);
    });

    it('can register multiple competition types', () => {
      registry.register(BR60S);
      registry.register(BP60);
      expect(registry.getAll()).toHaveLength(2);
    });

    it('can overwrite registration with the same ID', () => {
      const modified: CompetitionTypeDefinition = {
        ...BR60S,
        name: 'Modified',
      };
      registry.register(BR60S);
      registry.register(modified);
      expect(registry.get('BR60S')?.name).toBe('Modified');
    });
  });

  describe('get()', () => {
    it('can retrieve a registered competition type by ID', () => {
      registry.register(BR60S);
      const result = registry.get('BR60S');
      expect(result).toBe(BR60S);
    });

    it('returns undefined for unregistered ID', () => {
      const result = registry.get('NONEXISTENT');
      expect(result).toBeUndefined();
    });
  });

  describe('getAll()', () => {
    it('empty registry returns empty array', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('returns all registered competition types', () => {
      registry.register(BR60S);
      registry.register(BP60);
      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(BR60S);
      expect(all).toContain(BP60);
    });
  });

  describe('competition type definition content verification', () => {
    it('registers both air and beam 60-shot competition types', () => {
      expect(ALL_COMPETITION_TYPES).toEqual([AR60, AP60, BR60S, BP60]);
    });

    it('BR60S has 10m air rifle definition', () => {
      expect(BR60S.id).toBe('BR60S');
      expect(BR60S.name).toBe('10m Beam Rifle 60 shots standing');
      expect(BR60S.config.shotsPerSeries).toBe(10);
      expect(BR60S.config.stages).toHaveLength(2);
    });

    it('AR60 has a decimal 10m air rifle definition', () => {
      expect(AR60.id).toBe('AR60');
      expect(AR60.name).toBe('10m Air Rifle 60 shots');
      expect(AR60.discipline).toBe('AIR_RIFLE_10M');
      expect(AR60.config.acc).toBe('DECIMAL');
      expect(AR60.config.shotsPerSeries).toBe(10);
      expect(AR60.config.stages).toHaveLength(2);
    });

    it('AR60 has a 15-minute sighting stage and a 75-minute 60-shot match stage', () => {
      const sighting = AR60.config.stages[0]!;
      expect(sighting.scored).toBe(false);
      expect(sighting.series[0]!.maxShots).toBe(0);
      expect(sighting.timer?.durationSeconds).toBe(900);

      const match = AR60.config.stages[1]!;
      expect(match.scored).toBe(true);
      expect(match.series).toHaveLength(6);
      expect(match.timer?.durationSeconds).toBe(4500);
      for (const series of match.series) {
        expect(series.maxShots).toBe(10);
      }
    });

    it('AP60 has an integer-scored 10m air pistol definition', () => {
      expect(AP60.id).toBe('AP60');
      expect(AP60.name).toBe('10m Air Pistol 60 shots');
      expect(AP60.discipline).toBe('AIR_PISTOL_10M');
      expect(AP60.config.acc).toBe('RING');
      expect(AP60.config.shotsPerSeries).toBe(10);
      expect(AP60.config.stages).toHaveLength(2);
    });

    it('AP60 has a 15-minute sighting stage and a 75-minute 60-shot match stage', () => {
      const sighting = AP60.config.stages[0]!;
      expect(sighting.scored).toBe(false);
      expect(sighting.series[0]!.maxShots).toBe(0);
      expect(sighting.timer?.durationSeconds).toBe(900);

      const match = AP60.config.stages[1]!;
      expect(match.scored).toBe(true);
      expect(match.series).toHaveLength(6);
      expect(match.timer?.durationSeconds).toBe(4500);
      for (const series of match.series) {
        expect(series.maxShots).toBe(10);
      }
    });

    it('BR60S scoring method is DECIMAL', () => {
      expect(BR60S.config.acc).toBe('DECIMAL');
    });

    it('BP60 scoring method is RING', () => {
      expect(BP60.config.acc).toBe('RING');
    });

    it('BR60S sighting shot stage has unlimited shots and 10-minute timer', () => {
      const prep = BR60S.config.stages[0]!;
      expect(prep.scored).toBe(false);
      expect(prep.series[0]!.maxShots).toBe(0);
      expect(prep.timer?.durationSeconds).toBe(600);
    });

    it('BR60S match shot stage has 6 series × 10 shots and 45-minute timer', () => {
      const match = BR60S.config.stages[1]!;
      expect(match.scored).toBe(true);
      expect(match.series).toHaveLength(6);
      expect(match.timer?.durationSeconds).toBe(2700);
      for (const series of match.series) {
        expect(series.maxShots).toBe(10);
      }
    });

    it('BP60 has 10m beam pistol definition', () => {
      expect(BP60.id).toBe('BP60');
      expect(BP60.name).toBe('10m Beam Pistol 60 shots');
      expect(BP60.discipline).toBe('BEAM_PISTOL_10M');
      expect(BP60.config.stages).toHaveLength(2);
    });
  });
});
