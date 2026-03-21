// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { DomainError } from '@/shared/errors/DomainError';

/**
 * Concrete DomainError subclass for testing
 */
class TestDomainError extends DomainError {
  constructor(
    code: string,
    message: string,
    userMessage: string,
    severity: 'error' | 'warning' | 'info' = 'error',
    metadata?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(code, message, userMessage, severity, metadata, cause);
  }
}

describe('DomainError base class', () => {
  describe('constructor', () => {
    it('creates a DomainError with required parameters', () => {
      const error = new TestDomainError('TEST_ERROR', 'A test error occurred', 'An error occurred');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('A test error occurred');
      expect(error.userMessage).toBe('An error occurred');
      expect(error.severity).toBe('error');
      expect(error.metadata).toBeUndefined();
      expect(error.cause).toBeUndefined();
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.name).toBe('TestDomainError');
    });

    it('creates a DomainError with all parameters specified', () => {
      const cause = new Error('Cause error');
      const metadata = { userId: '123', action: 'save' };
      const error = new TestDomainError(
        'VALIDATION_ERROR',
        'Validation error',
        'The input contains errors',
        'warning',
        metadata,
        cause,
      );

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Validation error');
      expect(error.userMessage).toBe('The input contains errors');
      expect(error.severity).toBe('warning');
      expect(error.metadata).toEqual(metadata);
      expect(error.cause).toBe(cause);
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('accepts info as severity', () => {
      const error = new TestDomainError('INFO_MESSAGE', 'Info message', 'Information', 'info');

      expect(error.severity).toBe('info');
    });
  });

  describe('toJSON() method', () => {
    it('returns error information in JSON format', () => {
      const error = new TestDomainError('TEST_ERROR', 'Test error', 'An error occurred');

      const json = error.toJSON();

      expect(json).toEqual({
        name: 'TestDomainError',
        code: 'TEST_ERROR',
        message: 'Test error',
        userMessage: 'An error occurred',
        severity: 'error',
        timestamp: error.timestamp.toISOString(),
        metadata: undefined,
        cause: undefined,
      });
    });

    it('returns error information including metadata and cause in JSON format', () => {
      const cause = new Error('Cause error');
      const metadata = { field: 'username' };
      const error = new TestDomainError(
        'VALIDATION_ERROR',
        'Validation error',
        'The input contains errors',
        'warning',
        metadata,
        cause,
      );

      const json = error.toJSON();

      expect(json).toEqual({
        name: 'TestDomainError',
        code: 'VALIDATION_ERROR',
        message: 'Validation error',
        userMessage: 'The input contains errors',
        severity: 'warning',
        timestamp: error.timestamp.toISOString(),
        metadata,
        cause: {
          name: 'Error',
          message: 'Cause error',
          stack: cause.stack,
        },
      });
    });
  });

  describe('toUserDisplay() method', () => {
    it('returns the user-facing display string', () => {
      const error = new TestDomainError('SESSION_NOT_FOUND', 'Session not found', 'Session was not found');

      expect(error.toUserDisplay()).toBe('Session was not found');
    });

    it('returns the correct display string when severity is warning', () => {
      const error = new TestDomainError('WARNING_CODE', 'Warning message', 'A warning occurred', 'warning');

      expect(error.toUserDisplay()).toBe('A warning occurred');
    });
  });

  describe('wrap() static method', () => {
    it('wraps a regular Error with a DomainError', () => {
      const originalError = new Error('Original error');
      const wrapped = DomainError.wrap(originalError, 'WRAPPED_ERROR', 'An error occurred');

      expect(wrapped).toBeInstanceOf(DomainError);
      expect(wrapped.code).toBe('WRAPPED_ERROR');
      expect(wrapped.message).toBe('Original error');
      expect(wrapped.userMessage).toBe('An error occurred');
      expect(wrapped.cause).toBe(originalError);
    });

    it('returns the DomainError as-is if already a DomainError', () => {
      const domainError = new TestDomainError('ORIGINAL_ERROR', 'Original error', 'Error occurred');
      const wrapped = DomainError.wrap(domainError, 'WRAPPED_ERROR', 'Wrapped message');

      expect(wrapped).toBe(domainError);
      expect(wrapped.code).toBe('ORIGINAL_ERROR');
      expect(wrapped.userMessage).toBe('Error occurred');
    });
  });

  describe('immutability', () => {
    it('properties are read-only', () => {
      const error = new TestDomainError('TEST_ERROR', 'Test error', 'An error occurred');

      expect(() => {
        (error as any).code = 'MODIFIED_CODE';
      }).toThrow();

      expect(() => {
        (error as any).message = 'Modified message';
      }).toThrow();

      expect(() => {
        (error as any).severity = 'info';
      }).toThrow();
    });

    it('metadata object is read-only', () => {
      const metadata = { key: 'value' };
      const error = new TestDomainError('TEST_ERROR', 'Test error', 'An error occurred', 'error', metadata);

      expect(() => {
        error.metadata!.key = 'modified';
      }).toThrow();

      expect(() => {
        (error.metadata as any).newKey = 'newValue';
      }).toThrow();
    });

    it('metadata containing arrays is also read-only', () => {
      const metadata = { items: ['item1', 'item2'] };
      const error = new TestDomainError('TEST_ERROR', 'Test error', 'An error occurred', 'error', metadata);

      expect(() => {
        (error.metadata!.items as string[]).push('item3');
      }).toThrow();

      expect(() => {
        (error.metadata!.items as any)[0] = 'modified';
      }).toThrow();
    });
  });

  describe('Error protocol compatibility', () => {
    it('has a correct stack trace as an Error', () => {
      const error = new TestDomainError('TEST_ERROR', 'Test error', 'An error occurred');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TestDomainError');
    });

    it('returns an appropriate string representation via toString()', () => {
      const error = new TestDomainError('TEST_ERROR', 'Test error', 'An error occurred');

      expect(error.toString()).toContain('TestDomainError');
      expect(error.toString()).toContain('Test error');
    });
  });
});
