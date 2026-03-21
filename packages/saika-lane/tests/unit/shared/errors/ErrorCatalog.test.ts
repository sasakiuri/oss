// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { DomainError } from '@/shared/errors/DomainError';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

describe('ErrorCatalog', () => {
  describe('createError() method', () => {
    it('creates a SESSION_NOT_FOUND error', () => {
      const error = ErrorCatalog.createError('SESSION_NOT_FOUND');

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('SESSION_NOT_FOUND');
      expect(error.message).toBe('Session not found');
      expect(error.userMessage).toBe('Session not found');
      expect(error.severity).toBe('error');
    });

    it('creates a CONNECTION_FAILED error', () => {
      const error = ErrorCatalog.createError('CONNECTION_FAILED');

      expect(error.code).toBe('CONNECTION_FAILED');
      expect(error.message).toBe('Failed to connect to target');
      expect(error.userMessage).toBe('Failed to connect to target');
      expect(error.severity).toBe('error');
    });

    it('correctly creates a warning-level error', () => {
      const error = ErrorCatalog.createError('VALIDATION_ERROR');

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.severity).toBe('warning');
    });

    it('substitutes a single template variable', () => {
      const error = ErrorCatalog.createError('UNKNOWN_COMPETITION_TYPE', {
        typeId: 'BR100',
      });

      expect(error.message).toBe('Unknown competition type: BR100');
      expect(error.userMessage).toBe('Unknown competition type: BR100');
    });

    it('substitutes multiple template variables', () => {
      const error = ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
        from: 'Idle',
        to: 'Finished',
      });

      expect(error.message).toBe('Invalid phase transition: Idle → Finished');
      expect(error.userMessage).toBe('Invalid phase transition: Idle → Finished');
    });

    it('leaves placeholders intact when template variables are not provided', () => {
      const error = ErrorCatalog.createError('UNKNOWN_COMPETITION_TYPE');

      expect(error.message).toBe('Unknown competition type: {{typeId}}');
      expect(error.userMessage).toBe('Unknown competition type: {{typeId}}');
    });

    it('creates an error with metadata', () => {
      const metadata = { field: 'shotNumber', value: -1 };
      const error = ErrorCatalog.createError('VALIDATION_ERROR', metadata);

      expect(error.metadata).toEqual(metadata);
    });

    it('creates an error with a cause error', () => {
      const cause = new Error('Original error');
      const error = ErrorCatalog.createError('DATA_CONVERSION_ERROR', undefined, cause);

      expect(error.cause).toBe(cause);
      expect(error.cause?.message).toBe('Original error');
    });

    it('creates an error with both metadata and a cause error', () => {
      const metadata = { targetId: '123' };
      const cause = new Error('Connection timeout');
      const error = ErrorCatalog.createError('CONNECTION_FAILED', metadata, cause);

      expect(error.metadata).toEqual(metadata);
      expect(error.cause).toBe(cause);
    });

    it('creates an UNKNOWN_ERROR for an undefined error code', () => {
      const error = ErrorCatalog.createError('UNDEFINED_CODE' as any);

      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.message).toBe('Unknown error occurred');
      expect(error.userMessage).toBe('An unexpected error occurred');
      expect(error.severity).toBe('error');
    });

    it('converts number-type template variables to strings', () => {
      const error = ErrorCatalog.createError('INVALID_TIMER_DURATION', { value: 42 });

      expect(error.message).toContain('42');
    });
  });

  describe('getErrorDefinition() method', () => {
    it('retrieves the definition for SESSION_NOT_FOUND', () => {
      const definition = ErrorCatalog.getErrorDefinition('SESSION_NOT_FOUND');

      expect(definition).toBeDefined();
      expect(definition?.code).toBe('SESSION_NOT_FOUND');
      expect(definition?.message).toBe('Session not found');
      expect(definition?.userMessage).toBe('Session not found');
      expect(definition?.severity).toBe('error');
    });

    it('returns undefined for an undefined error code', () => {
      const definition = ErrorCatalog.getErrorDefinition('UNDEFINED_CODE' as any);

      expect(definition).toBeUndefined();
    });
  });

  describe('error creation consistency', () => {
    it('errors created with the same error code have the same definition', () => {
      const error1 = ErrorCatalog.createError('SESSION_NOT_FOUND');
      const error2 = ErrorCatalog.createError('SESSION_NOT_FOUND');

      expect(error1.code).toBe(error2.code);
      expect(error1.message).toBe(error2.message);
      expect(error1.userMessage).toBe(error2.userMessage);
      expect(error1.severity).toBe(error2.severity);
    });

    it('error from createError() matches the definition from getErrorDefinition()', () => {
      const error = ErrorCatalog.createError('CONNECTION_FAILED');
      const definition = ErrorCatalog.getErrorDefinition('CONNECTION_FAILED');

      expect(error.code).toBe(definition?.code);
      expect(error.message).toBe(definition?.message);
      expect(error.userMessage).toBe(definition?.userMessage);
      expect(error.severity).toBe(definition?.severity);
    });
  });

  describe('error immutability', () => {
    it('created errors are immutable', () => {
      const error = ErrorCatalog.createError('SESSION_NOT_FOUND');

      expect(() => {
        (error as any).code = 'MODIFIED_CODE';
      }).toThrow();
    });

    it('metadata of errors with metadata is immutable', () => {
      const metadata = { key: 'value' };
      const error = ErrorCatalog.createError('VALIDATION_ERROR', metadata);

      expect(() => {
        error.metadata!.key = 'modified';
      }).toThrow();
    });
  });
});
