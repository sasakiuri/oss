import { describe, it, expect } from 'vitest';
import { Score } from '@/main/modules/lane-control';

describe('Score', () => {
  it('should create valid score 0.0', () => {
    const s = Score.create(0.0);
    expect(s.value).toBe(0.0);
    expect(s.isZero()).toBe(true);
  });

  it('should create valid score 10.9', () => {
    const s = Score.create(10.9);
    expect(s.value).toBe(10.9);
  });

  it('should create score with rounding', () => {
    const s = Score.create(7.45);
    expect(s.value).toBe(7.5);
  });

  it('should throw for score below 0', () => {
    expect(() => Score.create(-0.1)).toThrow();
  });

  it('should throw for score above 10.9', () => {
    expect(() => Score.create(11.0)).toThrow();
  });

  it('should create zero score', () => {
    const s = Score.zero();
    expect(s.value).toBe(0.0);
    expect(s.isZero()).toBe(true);
  });

  it('should format score as string', () => {
    const s = Score.create(6.2);
    expect(s.toString()).toBe('6.2');
  });

  it('should format integer score with decimal', () => {
    const s = Score.create(10.0);
    expect(s.toString()).toBe('10.0');
  });
});
