import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  useHomeTargetStore,
  calculateHeightOfTarget,
  calculateBlackAreaSize,
  type Discipline,
  type Length,
} from '@/app/(standalone)/labs/home-target/_store';

describe('HomeTargetStore', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useHomeTargetStore());
    act(() => {
      result.current.reset();
    });
  });

  describe('calculateHeightOfTarget', () => {
    const discipline: Discipline = {
      name: '10m Air Rifle',
      key: 'AR10',
      distance: { number: 10, unit: 'm' },
      heightOfTarget: { number: 140, unit: 'cm' },
      blackAreaSize: { number: 3.05, unit: 'cm' },
    };

    it('should calculate target height correctly for half distance', () => {
      const heightOfEye: Length = { number: 170, unit: 'cm' };
      const distanceToTarget: Length = { number: 5, unit: 'm' };

      const result = calculateHeightOfTarget(heightOfEye, distanceToTarget, discipline);

      // At half distance (5m), height should be between eye height (170) and target height (140)
      expect(result).toBeGreaterThan(140);
      expect(result).toBeLessThan(170);
      // Expected: 140 * (1 - (1 - 170/140) * (1 - 5/10)) = 155
      expect(result).toBeCloseTo(155, 1);
    });

    it('should return discipline height at full distance', () => {
      const heightOfEye: Length = { number: 170, unit: 'cm' };
      const distanceToTarget: Length = { number: 10, unit: 'm' };

      const result = calculateHeightOfTarget(heightOfEye, distanceToTarget, discipline);

      expect(result).toBeCloseTo(140, 5);
    });

    it('should return eye height at zero distance', () => {
      const heightOfEye: Length = { number: 170, unit: 'cm' };
      const distanceToTarget: Length = { number: 0, unit: 'm' };

      const result = calculateHeightOfTarget(heightOfEye, distanceToTarget, discipline);

      expect(result).toBeCloseTo(170, 5);
    });
  });

  describe('calculateBlackAreaSize', () => {
    const discipline: Discipline = {
      name: '10m Air Rifle',
      key: 'AR10',
      distance: { number: 10, unit: 'm' },
      heightOfTarget: { number: 140, unit: 'cm' },
      blackAreaSize: { number: 3.05, unit: 'cm' },
    };

    it('should scale black area proportionally to distance', () => {
      const distanceToTarget: Length = { number: 5, unit: 'm' };

      const result = calculateBlackAreaSize(distanceToTarget, discipline);

      // At half distance, black area should be half size
      expect(result).toBeCloseTo(1.525, 3);
    });

    it('should return full size at full distance', () => {
      const distanceToTarget: Length = { number: 10, unit: 'm' };

      const result = calculateBlackAreaSize(distanceToTarget, discipline);

      expect(result).toBeCloseTo(3.05, 3);
    });

    it('should return zero at zero distance', () => {
      const distanceToTarget: Length = { number: 0, unit: 'm' };

      const result = calculateBlackAreaSize(distanceToTarget, discipline);

      expect(result).toBe(0);
    });
  });

  describe('store actions', () => {
    it('should update language', () => {
      const { result } = renderHook(() => useHomeTargetStore());

      expect(result.current.language).toBe('ja');

      act(() => {
        result.current.setLanguage('en');
      });

      expect(result.current.language).toBe('en');
    });

    it('should update height of eye', () => {
      const { result } = renderHook(() => useHomeTargetStore());

      act(() => {
        result.current.setHeightOfEye({ number: 165, unit: 'cm' });
      });

      expect(result.current.heightOfEye.number).toBe(165);
      expect(result.current.heightOfEye.unit).toBe('cm');
    });

    it('should update distance to target', () => {
      const { result } = renderHook(() => useHomeTargetStore());

      act(() => {
        result.current.setDistanceToTarget({ number: 7, unit: 'm' });
      });

      expect(result.current.distanceToTarget.number).toBe(7);
      expect(result.current.distanceToTarget.unit).toBe('m');
    });

    it('should update discipline', () => {
      const { result } = renderHook(() => useHomeTargetStore());
      const newDiscipline: Discipline = {
        name: '50m Rifle',
        key: 'FR50',
        distance: { number: 50, unit: 'm' },
        heightOfTarget: { number: 75, unit: 'cm' },
        blackAreaSize: { number: 11.24, unit: 'cm' },
      };

      act(() => {
        result.current.setDiscipline(newDiscipline);
      });

      expect(result.current.discipline.name).toBe('50m Rifle');
      expect(result.current.discipline.key).toBe('FR50');
    });

    it('should toggle readonly state', () => {
      const { result } = renderHook(() => useHomeTargetStore());

      expect(result.current.isReadonly).toBe(false);

      act(() => {
        result.current.setIsReadonly(true);
      });

      expect(result.current.isReadonly).toBe(true);
    });

    it('should toggle downloading state', () => {
      const { result } = renderHook(() => useHomeTargetStore());

      expect(result.current.isDownloading).toBe(false);

      act(() => {
        result.current.setIsDownloading(true);
      });

      expect(result.current.isDownloading).toBe(true);
    });

    it('should toggle dialog open state', () => {
      const { result } = renderHook(() => useHomeTargetStore());

      expect(result.current.isDisciplineDialogOpen).toBe(false);

      act(() => {
        result.current.setIsDisciplineDialogOpen(true);
      });

      expect(result.current.isDisciplineDialogOpen).toBe(true);
    });

    it('should reset to initial state', () => {
      const { result } = renderHook(() => useHomeTargetStore());

      // Modify state
      act(() => {
        result.current.setLanguage('en');
        result.current.setHeightOfEye({ number: 180, unit: 'cm' });
        result.current.setIsDownloading(true);
      });

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.language).toBe('ja');
      expect(result.current.heightOfEye.number).toBe(170);
      expect(result.current.isDownloading).toBe(false);
    });
  });
});
