// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from 'vitest';

import type { CompetitionTypeDefinition } from '@/main/modules/competition/domain/CompetitionTypeDefinition';
import { CompetitionTypeRegistry } from '@/main/modules/competition/domain/CompetitionTypeRegistry';
import { BP60, BR60S } from '@/main/modules/competition/domain/competitionTypes';

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
    it('BR60S has 10m air rifle definition', () => {
      expect(BR60S.id).toBe('BR60S');
      expect(BR60S.name).toBe('10m Beam Rifle 60 shots standing');
      expect(BR60S.config.shotsPerSeries).toBe(10);
      expect(BR60S.config.stages).toHaveLength(2);
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

    it('BP60 has 10m air pistol definition', () => {
      expect(BP60.id).toBe('BP60');
      expect(BP60.name).toBe('10m Beam Pistol 60 shots');
      expect(BP60.config.stages).toHaveLength(2);
    });
  });
});
