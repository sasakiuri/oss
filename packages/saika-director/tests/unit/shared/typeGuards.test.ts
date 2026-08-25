import { describe, it, expect } from 'vitest';
import { isDomainError, isErrorWithCode } from '@/shared/utils/typeGuards';
import { DomainError } from '@/shared/errors/DomainError';

describe('typeGuards', () => {
  describe('isDomainError', () => {
    it('should return true for DomainError instance', () => {
      const error = new DomainError({ code: 'TEST_001', message: 'Test error message' });
      expect(isDomainError(error)).toBe(true);
    });

    it('should return false for standard Error', () => {
      const error = new Error('Standard error');
      expect(isDomainError(error)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isDomainError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isDomainError(undefined)).toBe(false);
    });

    it('should return false for string', () => {
      expect(isDomainError('error message')).toBe(false);
    });

    it('should return false for plain object with code property', () => {
      const obj = { code: 'TEST_001', message: 'Test' };
      expect(isDomainError(obj)).toBe(false);
    });

    it('should return false for number', () => {
      expect(isDomainError(500)).toBe(false);
    });
  });

  describe('isErrorWithCode', () => {
    it('should return true for DomainError (has code property)', () => {
      const error = new DomainError({ code: 'TEST_001', message: 'Test error message' });
      expect(isErrorWithCode(error)).toBe(true);
      if (isErrorWithCode(error)) {
        expect(error.code).toBe('TEST_001');
      }
    });

    it('should return true for Error with code property added', () => {
      const error = new Error('Error with code');
      (error as Error & { code: string }).code = 'CUSTOM_001';
      expect(isErrorWithCode(error)).toBe(true);
      if (isErrorWithCode(error)) {
        expect(error.code).toBe('CUSTOM_001');
      }
    });

    it('should return false for standard Error without code property', () => {
      const error = new Error('Standard error');
      expect(isErrorWithCode(error)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isErrorWithCode(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isErrorWithCode(undefined)).toBe(false);
    });

    it('should return false for string', () => {
      expect(isErrorWithCode('error message')).toBe(false);
    });

    it('should return false for plain object with code property', () => {
      // Must be instance of Error
      const obj = { code: 'TEST_001', message: 'Test' };
      expect(isErrorWithCode(obj)).toBe(false);
    });

    it('should return false for Error with numeric code property', () => {
      const error = new Error('Error with numeric code');
      (error as Error & { code: number }).code = 500;
      expect(isErrorWithCode(error)).toBe(false);
    });

    it('should return false for Error with null code property', () => {
      const error = new Error('Error with null code');
      (error as Error & { code: null }).code = null;
      expect(isErrorWithCode(error)).toBe(false);
    });

    it('should allow type narrowing in conditional', () => {
      const error: unknown = new DomainError({ code: 'TEST_001', message: 'Test message' });
      if (isErrorWithCode(error)) {
        // TypeScript should allow accessing code property after type guard
        const code: string = error.code;
        expect(code).toBe('TEST_001');
      }
    });
  });
});
