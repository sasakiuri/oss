import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { CompetitionTypeDefinition, CompetitionTypeStrategy } from '@/shared/competitionTypes';
import { BP60 } from '@/shared/competitionTypes/definitions/BP60';

describe('CompetitionTypeRegistry', () => {
  let registry: CompetitionTypeRegistry;

  const mockDef: CompetitionTypeDefinition = {
    id: 'TEST',
    name: 'Test',
    scoring: { minScore: 0, maxScore: 109, precision: 1 },
    config: {
      name: 'Qualification',
      maxChannels: 10,
      hasRelay: true,
      stages: [
        {
          name: 'Preparation',
          type: 'preparation',
          series: [{ shots: 0 }],
          timer: { mode: 'stage', durationSec: 600 },
        },
        {
          name: 'Match',
          type: 'match',
          series: [{ shots: 10 }, { shots: 10 }, { shots: 10 }, { shots: 10 }, { shots: 10 }, { shots: 10 }],
          timer: { mode: 'series', durationSec: 450 },
        },
      ],
    },
    rankingStrategyId: 'standard',
    displayHints: { shortName: 'TEST', description: 'Test Type' },
    resultFormat: { totalShots: 60, totalSeries: 6 },
  };

  const mockStrategy: CompetitionTypeStrategy = {
    id: 'standard',
    padShots: vi.fn(),
    padSeries: vi.fn(),
    compareResults: vi.fn(),
    splitFinalStages: vi.fn(),
  };

  beforeEach(() => {
    registry = new CompetitionTypeRegistry();
  });

  describe('register', () => {
    it('should register a competition type definition', () => {
      registry.register(mockDef);

      expect(registry.has('TEST')).toBe(true);
    });

    it('should throw on duplicate registration', () => {
      registry.register(mockDef);

      expect(() => registry.register(mockDef)).toThrow('Competition type "TEST" is already registered.');
    });

    it('should allow registering different definitions', () => {
      const otherDef = { ...mockDef, id: 'OTHER', name: 'Other' };
      registry.register(mockDef);
      registry.register(otherDef);

      expect(registry.has('TEST')).toBe(true);
      expect(registry.has('OTHER')).toBe(true);
    });
  });

  describe('registerStrategy', () => {
    it('should register a strategy', () => {
      registry.registerStrategy(mockStrategy);

      expect(registry.getStrategy('standard')).toBe(mockStrategy);
    });

    it('should throw on duplicate strategy registration', () => {
      registry.registerStrategy(mockStrategy);

      expect(() => registry.registerStrategy(mockStrategy)).toThrow('Strategy "standard" is already registered.');
    });

    it('should allow registering different strategies', () => {
      const otherStrategy: CompetitionTypeStrategy = {
        ...mockStrategy,
        id: 'custom',
        padShots: vi.fn(),
        padSeries: vi.fn(),
        compareResults: vi.fn(),
        splitFinalStages: vi.fn(),
      };
      registry.registerStrategy(mockStrategy);
      registry.registerStrategy(otherStrategy);

      expect(registry.getStrategy('standard')).toBe(mockStrategy);
      expect(registry.getStrategy('custom')).toBe(otherStrategy);
    });
  });

  describe('get', () => {
    it('should return a registered definition', () => {
      registry.register(mockDef);

      const result = registry.get('TEST');

      expect(result).toBe(mockDef);
      expect(result.id).toBe('TEST');
      expect(result.name).toBe('Test');
    });

    it('should throw on unknown ID', () => {
      expect(() => registry.get('UNKNOWN')).toThrow('Competition type "UNKNOWN" is not registered.');
    });
  });

  describe('getStrategy', () => {
    it('should return a registered strategy', () => {
      registry.registerStrategy(mockStrategy);

      const result = registry.getStrategy('standard');

      expect(result).toBe(mockStrategy);
      expect(result.id).toBe('standard');
    });

    it('should throw on unknown strategy ID', () => {
      expect(() => registry.getStrategy('unknown')).toThrow('Strategy "unknown" is not registered.');
    });
  });

  describe('getStrategyFor', () => {
    it('should look up strategy via definition rankingStrategyId', () => {
      registry.register(mockDef);
      registry.registerStrategy(mockStrategy);

      const result = registry.getStrategyFor(mockDef);

      expect(result).toBe(mockStrategy);
    });

    it('should throw if strategy referenced by definition is not registered', () => {
      const defWithMissingStrategy = { ...mockDef, rankingStrategyId: 'nonexistent' };

      expect(() => registry.getStrategyFor(defWithMissingStrategy)).toThrow(
        'Strategy "nonexistent" is not registered.',
      );
    });
  });

  describe('getAll', () => {
    it('should return empty array when no definitions registered', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('should return all registered definitions as array', () => {
      const otherDef = { ...mockDef, id: 'OTHER', name: 'Other' };
      registry.register(mockDef);
      registry.register(otherDef);

      const all = registry.getAll();

      expect(all).toHaveLength(2);
      expect(all).toContain(mockDef);
      expect(all).toContain(otherDef);
    });
  });

  describe('has', () => {
    it('should return true for registered definition', () => {
      registry.register(mockDef);

      expect(registry.has('TEST')).toBe(true);
    });

    it('should return false for unregistered definition', () => {
      expect(registry.has('NONEXISTENT')).toBe(false);
    });
  });

  describe('_reset', () => {
    it('should clear all definitions', () => {
      registry.register(mockDef);
      expect(registry.has('TEST')).toBe(true);

      registry._reset();

      expect(registry.has('TEST')).toBe(false);
      expect(registry.getAll()).toEqual([]);
    });

    it('should clear all strategies', () => {
      registry.registerStrategy(mockStrategy);
      expect(registry.getStrategy('standard')).toBe(mockStrategy);

      registry._reset();

      expect(() => registry.getStrategy('standard')).toThrow('Strategy "standard" is not registered.');
    });

    it('should clear both definitions and strategies simultaneously', () => {
      registry.register(mockDef);
      registry.registerStrategy(mockStrategy);

      registry._reset();

      expect(registry.has('TEST')).toBe(false);
      expect(registry.getAll()).toEqual([]);
      expect(() => registry.getStrategy('standard')).toThrow();
    });

    it('should allow re-registration after reset', () => {
      registry.register(mockDef);
      registry.registerStrategy(mockStrategy);

      registry._reset();

      // Should not throw on re-registration
      registry.register(mockDef);
      registry.registerStrategy(mockStrategy);

      expect(registry.has('TEST')).toBe(true);
      expect(registry.getStrategy('standard')).toBe(mockStrategy);
    });
  });
});

describe('built-in competition scoring', () => {
  it('defines BP60 qualification as integer ring scoring', () => {
    expect(BP60.scoring).toEqual({ minScore: 0, maxScore: 100, precision: 0 });
  });
});
