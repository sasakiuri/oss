// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { Timer } from '@/main/modules/competition/domain/Timer';
import { DomainError } from '@/shared/errors/DomainError';

function expectDomainError(fn: () => void, code: string): DomainError {
  try {
    fn();
    expect.unreachable('Should have thrown');
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe(code);
    return e as DomainError;
  }
}

describe('Timer value object', () => {
  describe('create()', () => {
    it('can create a timer with specified seconds', () => {
      const timer = Timer.create(900);
      expect(timer.remainingSeconds).toBe(900);
      expect(timer.totalSeconds).toBe(900);
    });

    it('can create a timer with 0 seconds', () => {
      const timer = Timer.create(0);
      expect(timer.remainingSeconds).toBe(0);
      expect(timer.totalSeconds).toBe(0);
    });

    it('throws INVALID_TIMER_DURATION error for negative seconds', () => {
      expectDomainError(() => Timer.create(-1), 'INVALID_TIMER_DURATION');
    });

    it('error for negative seconds includes metadata', () => {
      const error = expectDomainError(() => Timer.create(-1), 'INVALID_TIMER_DURATION');
      expect(error.metadata).toEqual({ value: -1 });
    });

    it('throws INVALID_TIMER_DURATION error for decimal seconds', () => {
      expectDomainError(() => Timer.create(1.5), 'INVALID_TIMER_DURATION');
    });

    it('error for decimal seconds includes metadata', () => {
      const error = expectDomainError(() => Timer.create(1.5), 'INVALID_TIMER_DURATION');
      expect(error.metadata).toEqual({ value: 1.5 });
    });

    it('throws INVALID_TIMER_DURATION error for NaN', () => {
      expectDomainError(() => Timer.create(NaN), 'INVALID_TIMER_DURATION');
    });

    it('throws INVALID_TIMER_DURATION error for Infinity', () => {
      expectDomainError(() => Timer.create(Infinity), 'INVALID_TIMER_DURATION');
    });

    it('can create a timer with a large positive integer', () => {
      const timer = Timer.create(86400);
      expect(timer.remainingSeconds).toBe(86400);
      expect(timer.totalSeconds).toBe(86400);
    });
  });

  describe('tick()', () => {
    it('returns a new Timer decremented by 1 second', () => {
      const timer = Timer.create(10);
      const ticked = timer.tick();
      expect(ticked.remainingSeconds).toBe(9);
      expect(ticked.totalSeconds).toBe(10);
    });

    it('original Timer is not modified', () => {
      const timer = Timer.create(10);
      timer.tick();
      expect(timer.remainingSeconds).toBe(10);
    });

    it('does not go below 0 when ticking at 0 remaining seconds', () => {
      const timer = Timer.create(0);
      const ticked = timer.tick();
      expect(ticked.remainingSeconds).toBe(0);
    });
  });

  describe('tickBy()', () => {
    it('returns a new Timer decremented by n seconds', () => {
      const timer = Timer.create(100);
      const ticked = timer.tickBy(30);
      expect(ticked.remainingSeconds).toBe(70);
      expect(ticked.totalSeconds).toBe(100);
    });

    it('does not go below 0 even if decrement exceeds remaining seconds', () => {
      const timer = Timer.create(10);
      const ticked = timer.tickBy(15);
      expect(ticked.remainingSeconds).toBe(0);
    });
  });

  describe('formattedRemaining', () => {
    it('displays in MM:SS format', () => {
      const timer = Timer.create(125);
      expect(timer.formattedRemaining).toBe('02:05');
    });

    it('displays 0 seconds as 00:00', () => {
      const timer = Timer.create(0);
      expect(timer.formattedRemaining).toBe('00:00');
    });

    it('displays 15 minutes (900 seconds) as 15:00', () => {
      const timer = Timer.create(900);
      expect(timer.formattedRemaining).toBe('15:00');
    });

    it('displays 75 minutes (4500 seconds) as 75:00', () => {
      const timer = Timer.create(4500);
      expect(timer.formattedRemaining).toBe('75:00');
    });

    it('displays 1 second as 00:01', () => {
      const timer = Timer.create(1);
      expect(timer.formattedRemaining).toBe('00:01');
    });
  });

  describe('isExpired', () => {
    it('returns true when remaining seconds is 0', () => {
      const timer = Timer.create(0);
      expect(timer.isExpired).toBe(true);
    });

    it('returns false when remaining seconds is 1 or more', () => {
      const timer = Timer.create(1);
      expect(timer.isExpired).toBe(false);
    });

    it('returns true when tickBy reduces to 0', () => {
      const timer = Timer.create(10);
      const expired = timer.tickBy(10);
      expect(expired.isExpired).toBe(true);
    });

    it('returns true when tickBy reduces to below 0', () => {
      const timer = Timer.create(5);
      const expired = timer.tickBy(10);
      expect(expired.isExpired).toBe(true);
    });
  });

  describe('equals()', () => {
    it('Timers with same values are equal', () => {
      const a = Timer.create(100);
      const b = Timer.create(100);
      expect(a.equals(b)).toBe(true);
    });

    it('Timers with different remaining seconds are not equal', () => {
      const a = Timer.create(100);
      const b = a.tick();
      expect(a.equals(b)).toBe(false);
    });

    it('Timers with different totalSeconds are not equal', () => {
      const a = Timer.reconstruct(50, 100);
      const b = Timer.reconstruct(50, 200);
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('reconstruct()', () => {
    it('can reconstruct with specified remaining and total', () => {
      const timer = Timer.reconstruct(50, 100);
      expect(timer.remainingSeconds).toBe(50);
      expect(timer.totalSeconds).toBe(100);
    });

    it('throws INVALID_TIMER_DURATION error for invalid totalSeconds', () => {
      expectDomainError(() => Timer.reconstruct(50, -1), 'INVALID_TIMER_DURATION');
    });

    it('clamps remaining to 0 when remaining is negative', () => {
      const timer = Timer.reconstruct(-5, 100);
      expect(timer.remainingSeconds).toBe(0);
    });
  });

  describe('immutability', () => {
    it('properties are read-only', () => {
      const timer = Timer.create(100);
      expect(() => {
        (timer as any).remainingSeconds = 0;
      }).toThrow();
    });

    it('totalSeconds is also read-only', () => {
      const timer = Timer.create(100);
      expect(() => {
        (timer as any).totalSeconds = 0;
      }).toThrow();
    });
  });
});
