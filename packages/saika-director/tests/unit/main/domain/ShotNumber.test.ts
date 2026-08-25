import { describe, it, expect } from 'vitest';
import { ShotNumber } from '@/main/modules/lane-control';

describe('ShotNumber', () => {
  it('should create shot number 1', () => {
    const sn = ShotNumber.create(1);
    expect(sn.value).toBe(1);
    expect(sn.seriesNumber()).toBe(1);
    expect(sn.positionInSeries()).toBe(1);
  });

  it('should calculate series for shot 10', () => {
    const sn = ShotNumber.create(10);
    expect(sn.seriesNumber()).toBe(1);
    expect(sn.positionInSeries()).toBe(10);
  });

  it('should calculate series for shot 11', () => {
    const sn = ShotNumber.create(11);
    expect(sn.seriesNumber()).toBe(2);
    expect(sn.positionInSeries()).toBe(1);
  });

  it('should calculate series for shot 60', () => {
    const sn = ShotNumber.create(60);
    expect(sn.seriesNumber()).toBe(6);
    expect(sn.positionInSeries()).toBe(10);
  });

  it('should throw for shot number 0', () => {
    expect(() => ShotNumber.create(0)).toThrow();
  });

  it('should throw for negative shot number', () => {
    expect(() => ShotNumber.create(-1)).toThrow();
  });

  it('should compare shot numbers', () => {
    const sn1 = ShotNumber.create(5);
    const sn2 = ShotNumber.create(10);
    expect(sn1.isGreaterThan(sn2)).toBe(false);
    expect(sn2.isGreaterThan(sn1)).toBe(true);
  });

  describe('custom shotsPerSeries', () => {
    it('should calculate series with 5 shots per series', () => {
      const sn = ShotNumber.create(6);
      expect(sn.seriesNumber(5)).toBe(2);
      expect(sn.positionInSeries(5)).toBe(1);
    });

    it('should handle boundary with 5 shots per series', () => {
      const sn = ShotNumber.create(5);
      expect(sn.seriesNumber(5)).toBe(1);
      expect(sn.positionInSeries(5)).toBe(5);
    });

    it('should calculate series with 20 shots per series', () => {
      const sn = ShotNumber.create(21);
      expect(sn.seriesNumber(20)).toBe(2);
      expect(sn.positionInSeries(20)).toBe(1);
    });
  });
});
