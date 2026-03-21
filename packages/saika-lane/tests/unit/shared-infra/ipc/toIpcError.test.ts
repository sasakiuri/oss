// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { toIpcError } from '@/main/shared-infra/ipc/toIpcError';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

// Mock electron app so toIpcError thinks it's in dev mode (stack traces included)
vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

describe('toIpcError', () => {
  describe('DomainError conversion', () => {
    it('converts a DomainError to an IpcErrorDto', () => {
      const domainError = ErrorCatalog.createError('SESSION_NOT_FOUND');
      const result = toIpcError(domainError);

      expect(result.code).toBe('SESSION_NOT_FOUND');
      expect(result.message).toBe('Session not found');
    });

    it('preserves the DomainError error code', () => {
      const domainError = ErrorCatalog.createError('CONNECTION_FAILED');
      const result = toIpcError(domainError);

      expect(result.code).toBe('CONNECTION_FAILED');
    });

    it('includes DomainError metadata in the IpcErrorDto', () => {
      const domainError = ErrorCatalog.createError('VALIDATION_ERROR', { field: 'name' });
      const result = toIpcError(domainError);

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.field).toBe('name');
    });

    it('merges caller metadata with DomainError metadata', () => {
      const domainError = ErrorCatalog.createError('VALIDATION_ERROR', { field: 'name' });
      const result = toIpcError(domainError, { context: 'form' });

      expect(result.metadata?.field).toBe('name');
      expect(result.metadata?.context).toBe('form');
    });

    it('includes stack trace in development environment', () => {
      const domainError = ErrorCatalog.createError('SESSION_NOT_FOUND');
      const result = toIpcError(domainError);

      expect(result.stack).toBeDefined();
      expect(typeof result.stack).toBe('string');
    });
  });

  describe('standard Error conversion', () => {
    it('converts a standard Error to an IpcErrorDto', () => {
      const error = new Error('Something went wrong');
      const result = toIpcError(error);

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('Something went wrong');
    });

    it('includes the standard Error stack trace', () => {
      const error = new Error('test');
      const result = toIpcError(error);

      expect(result.stack).toBeDefined();
    });

    it('attaches caller metadata to a standard Error', () => {
      const error = new Error('test');
      const result = toIpcError(error, { handler: 'sessionHandler' });

      expect(result.metadata?.handler).toBe('sessionHandler');
    });
  });

  describe('non-Error type conversion', () => {
    it('converts a string to an IpcErrorDto', () => {
      const result = toIpcError('string error');

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('string error');
    });

    it('converts a number to an IpcErrorDto', () => {
      const result = toIpcError(42);

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('42');
    });

    it('converts null to an IpcErrorDto', () => {
      const result = toIpcError(null);

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('null');
    });

    it('converts undefined to an IpcErrorDto', () => {
      const result = toIpcError(undefined);

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('undefined');
    });
  });

  describe('metadata merging', () => {
    it('omits metadata field when metadata is an empty object', () => {
      const error = new Error('test');
      const result = toIpcError(error, {});

      expect(result.metadata).toBeUndefined();
    });

    it('omits metadata when DomainError has no metadata and no caller metadata is provided', () => {
      const domainError = ErrorCatalog.createError('SESSION_NOT_FOUND');
      const result = toIpcError(domainError);

      expect(result.metadata).toBeUndefined();
    });
  });
});
