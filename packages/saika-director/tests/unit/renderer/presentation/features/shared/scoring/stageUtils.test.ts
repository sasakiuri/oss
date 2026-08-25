import { describe, it, expect } from 'vitest';
import { calculateStage1Series } from '@/renderer/presentation/features/shared/scoring/stageUtils';

describe('calculateStage1Series', () => {
  it('should split 10 shots into first5 and second5', () => {
    const shots = [10.0, 10.1, 10.2, 10.3, 10.4, 9.5, 9.6, 9.7, 9.8, 9.9];
    const result = calculateStage1Series(shots);

    expect(result.first5).toEqual([10.0, 10.1, 10.2, 10.3, 10.4]);
    expect(result.second5).toEqual([9.5, 9.6, 9.7, 9.8, 9.9]);
  });

  it('should calculate correct totals', () => {
    const shots = [10.0, 10.0, 10.0, 10.0, 10.0, 9.0, 9.0, 9.0, 9.0, 9.0];
    const result = calculateStage1Series(shots);

    expect(result.first5Total).toBe(50.0);
    expect(result.second5Total).toBe(45.0);
  });

  it('should handle less than 5 shots', () => {
    const shots = [10.0, 10.1, 10.2];
    const result = calculateStage1Series(shots);

    expect(result.first5).toEqual([10.0, 10.1, 10.2]);
    expect(result.second5).toEqual([]);
    expect(result.first5Total).toBeCloseTo(30.3);
    expect(result.second5Total).toBe(0);
  });

  it('should handle empty shots', () => {
    const result = calculateStage1Series([]);

    expect(result.first5).toEqual([]);
    expect(result.second5).toEqual([]);
    expect(result.first5Total).toBe(0);
    expect(result.second5Total).toBe(0);
  });

  it('should handle exactly 5 shots', () => {
    const shots = [10.0, 10.1, 10.2, 10.3, 10.4];
    const result = calculateStage1Series(shots);

    expect(result.first5).toEqual([10.0, 10.1, 10.2, 10.3, 10.4]);
    expect(result.second5).toEqual([]);
    expect(result.first5Total).toBe(51.0);
    expect(result.second5Total).toBe(0);
  });

  it('should only take first 10 shots even if more are provided', () => {
    const shots = [10.0, 10.0, 10.0, 10.0, 10.0, 9.0, 9.0, 9.0, 9.0, 9.0, 8.0, 8.0];
    const result = calculateStage1Series(shots);

    expect(result.first5).toHaveLength(5);
    expect(result.second5).toHaveLength(5);
    // The extra shots (8.0, 8.0) should not be included
    expect(result.second5).toEqual([9.0, 9.0, 9.0, 9.0, 9.0]);
  });
});
