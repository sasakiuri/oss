import { describe, it, expect } from 'vitest';
import { DomainError } from '@/shared/errors/DomainError';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

describe('DomainError', () => {
  describe('constructor', () => {
    it('creates error from catalog entry with default message', () => {
      const error = new DomainError(ErrorCatalog.SCORE.OUT_OF_RANGE);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DomainError);
      expect(error.name).toBe('DomainError');
      expect(error.code).toBe('SCORE_001');
      expect(error.message).toBe('Score out of range (0.0-10.9)');
      expect(error.metadata).toBeUndefined();
    });

    it('supports messageOverride', () => {
      const error = new DomainError(ErrorCatalog.LANE.NOT_FOUND, {
        messageOverride: 'Lane abc not found',
      });

      expect(error.code).toBe('LANE_000');
      expect(error.message).toBe('Lane abc not found');
    });

    it('supports cause chaining', () => {
      const cause = new Error('underlying cause');
      const error = new DomainError(ErrorCatalog.DATA.CORRUPTED, { cause });

      expect(error.cause).toBe(cause);
    });

    it('supports metadata', () => {
      const error = new DomainError(ErrorCatalog.SHOT.INDEX_OUT_OF_RANGE, {
        metadata: { index: 5, max: 3 },
      });

      expect(error.metadata).toEqual({ index: 5, max: 3 });
    });
  });

  describe('from()', () => {
    it('creates error from catalog entry', () => {
      const error = DomainError.from(ErrorCatalog.TIMER.INVALID_DURATION);

      expect(error.code).toBe('TIMER_001');
      expect(error.message).toBe('Timer duration must be a non-negative integer');
      expect(error.metadata).toBeUndefined();
    });

    it('creates error with metadata', () => {
      const error = DomainError.from(ErrorCatalog.CHANNEL.OUT_OF_RANGE, { channel: 99 });

      expect(error.code).toBe('CH_001');
      expect(error.metadata).toEqual({ channel: 99 });
    });
  });

  describe('wrap()', () => {
    it('wraps another error with cause', () => {
      const original = new TypeError('bad type');
      const error = DomainError.wrap(ErrorCatalog.GENERAL.UNKNOWN_ERROR, original);

      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.cause).toBe(original);
    });

    it('wraps with metadata', () => {
      const original = new Error('db failure');
      const error = DomainError.wrap(ErrorCatalog.DATA.NOT_FOUND, original, { table: 'results' });

      expect(error.code).toBe('DATA_001');
      expect(error.cause).toBe(original);
      expect(error.metadata).toEqual({ table: 'results' });
    });
  });

  describe('error code consistency', () => {
    it('preserves COMP_002 code for INVALID_PHASE_TRANSITION', () => {
      const error = DomainError.from(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION);
      expect(error.code).toBe('COMP_002');
    });

    it('preserves SHOOTOFF_001 code for INSUFFICIENT_PARTICIPANTS', () => {
      const error = DomainError.from(ErrorCatalog.SHOOTOFF.INSUFFICIENT_PARTICIPANTS);
      expect(error.code).toBe('SHOOTOFF_001');
    });
  });
});
