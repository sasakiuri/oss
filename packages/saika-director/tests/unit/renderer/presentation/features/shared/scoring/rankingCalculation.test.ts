import { describe, it, expect } from 'vitest';
import {
  calculateCurrentRanks,
  getRankStyle,
  type RankableLane,
} from '@/renderer/presentation/features/shared/scoring/rankingCalculation';

describe('calculateCurrentRanks', () => {
  it('should rank active lanes by totalScore descending', () => {
    const lanes: RankableLane[] = [
      { id: 'a', totalScore: 100, eliminated: false, eliminationRank: null },
      { id: 'b', totalScore: 200, eliminated: false, eliminationRank: null },
      { id: 'c', totalScore: 150, eliminated: false, eliminationRank: null },
    ];

    const ranks = calculateCurrentRanks(lanes);

    expect(ranks.get('b')).toBe(1); // 200
    expect(ranks.get('c')).toBe(2); // 150
    expect(ranks.get('a')).toBe(3); // 100
  });

  it('should assign the same rank for tied scores', () => {
    const lanes: RankableLane[] = [
      { id: 'a', totalScore: 100, eliminated: false, eliminationRank: null },
      { id: 'b', totalScore: 100, eliminated: false, eliminationRank: null },
      { id: 'c', totalScore: 50, eliminated: false, eliminationRank: null },
    ];

    const ranks = calculateCurrentRanks(lanes);

    expect(ranks.get('a')).toBe(1);
    expect(ranks.get('b')).toBe(1);
    expect(ranks.get('c')).toBe(3);
  });

  it('should use eliminationRank for eliminated lanes', () => {
    const lanes: RankableLane[] = [
      { id: 'a', totalScore: 200, eliminated: false, eliminationRank: null },
      { id: 'b', totalScore: 100, eliminated: true, eliminationRank: 5 },
      { id: 'c', totalScore: 80, eliminated: true, eliminationRank: 6 },
    ];

    const ranks = calculateCurrentRanks(lanes);

    expect(ranks.get('a')).toBe(1);
    expect(ranks.get('b')).toBe(5);
    expect(ranks.get('c')).toBe(6);
  });

  it('should skip eliminated lanes without eliminationRank', () => {
    const lanes: RankableLane[] = [
      { id: 'a', totalScore: 200, eliminated: false, eliminationRank: null },
      { id: 'b', totalScore: 100, eliminated: true, eliminationRank: null },
    ];

    const ranks = calculateCurrentRanks(lanes);

    expect(ranks.get('a')).toBe(1);
    expect(ranks.has('b')).toBe(false);
  });

  it('should handle empty array', () => {
    const ranks = calculateCurrentRanks([]);
    expect(ranks.size).toBe(0);
  });

  it('should handle all eliminated lanes', () => {
    const lanes: RankableLane[] = [
      { id: 'a', totalScore: 100, eliminated: true, eliminationRank: 3 },
      { id: 'b', totalScore: 80, eliminated: true, eliminationRank: 4 },
    ];

    const ranks = calculateCurrentRanks(lanes);

    expect(ranks.get('a')).toBe(3);
    expect(ranks.get('b')).toBe(4);
  });
});

describe('getRankStyle', () => {
  it('should return gold style for rank 1', () => {
    const style = getRankStyle(1);
    expect(style.color).toBe('text-yellow-400');
    expect(style.icon).toBe(true);
  });

  it('should return silver style for rank 2', () => {
    const style = getRankStyle(2);
    expect(style.color).toBe('text-gray-300');
    expect(style.icon).toBe(true);
  });

  it('should return bronze style for rank 3', () => {
    const style = getRankStyle(3);
    expect(style.color).toBe('text-amber-600');
    expect(style.icon).toBe(true);
  });

  it('should return default style for rank > 3', () => {
    const style = getRankStyle(4);
    expect(style.color).toBe('text-zinc-100');
    expect(style.icon).toBe(false);
  });

  it('should return default style for null rank', () => {
    const style = getRankStyle(null);
    expect(style.color).toBe('text-zinc-100');
    expect(style.icon).toBe(false);
  });
});
