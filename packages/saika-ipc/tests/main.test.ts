// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toIpcError } from '../src/main';

// Development by default (stack traces included); 'unavailable' makes `app.isPackaged` throw.
const electronApp = vi.hoisted(() => ({ packaged: false as boolean | 'unavailable' }));

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      if (electronApp.packaged === 'unavailable') throw new TypeError('app is not available');
      return electronApp.packaged;
    },
  },
}));

class TestDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly metadata?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const isDomainError = (error: Error): error is TestDomainError => error instanceof TestDomainError;

const sessionNotFound = () => new TestDomainError('SESSION_NOT_FOUND', 'Session not found');
const validationError = (metadata: Record<string, unknown>) =>
  new TestDomainError('VALIDATION_ERROR', 'Validation failed', metadata);

describe('toIpcError', () => {
  afterEach(() => {
    electronApp.packaged = false;
  });

  describe('DomainError conversion', () => {
    it('converts a DomainError to an IpcErrorDto', () => {
      const domainError = sessionNotFound();
      const result = toIpcError(domainError, { isDomainError });

      expect(result.code).toBe('SESSION_NOT_FOUND');
      expect(result.message).toBe('Session not found');
    });

    it('preserves the DomainError error code', () => {
      const domainError = new TestDomainError('CONNECTION_FAILED', 'Connection failed');
      const result = toIpcError(domainError, { isDomainError });

      expect(result.code).toBe('CONNECTION_FAILED');
    });

    it('includes DomainError metadata in the IpcErrorDto', () => {
      const domainError = validationError({ field: 'name' });
      const result = toIpcError(domainError, { isDomainError });

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.field).toBe('name');
    });

    it('merges caller metadata with DomainError metadata', () => {
      const domainError = validationError({ field: 'name' });
      const result = toIpcError(domainError, { isDomainError, metadata: { context: 'form' } });

      expect(result.metadata?.field).toBe('name');
      expect(result.metadata?.context).toBe('form');
    });

    it('includes stack trace in development environment', () => {
      const domainError = sessionNotFound();
      const result = toIpcError(domainError, { isDomainError });

      expect(result.stack).toBeDefined();
      expect(typeof result.stack).toBe('string');
    });
  });

  describe('standard Error conversion', () => {
    it('converts a standard Error to an IpcErrorDto', () => {
      const error = new Error('Something went wrong');
      const result = toIpcError(error, { isDomainError });

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('Something went wrong');
    });

    it('includes the standard Error stack trace', () => {
      const error = new Error('test');
      const result = toIpcError(error, { isDomainError });

      expect(result.stack).toBeDefined();
    });

    it('attaches caller metadata to a standard Error', () => {
      const error = new Error('test');
      const result = toIpcError(error, { isDomainError, metadata: { handler: 'sessionHandler' } });

      expect(result.metadata?.handler).toBe('sessionHandler');
    });
  });

  describe('non-Error type conversion', () => {
    it('converts a string to an IpcErrorDto', () => {
      const result = toIpcError('string error', { isDomainError });

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('string error');
    });

    it('converts a number to an IpcErrorDto', () => {
      const result = toIpcError(42, { isDomainError });

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('42');
    });

    it('converts null to an IpcErrorDto', () => {
      const result = toIpcError(null, { isDomainError });

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('null');
    });

    it('converts undefined to an IpcErrorDto', () => {
      const result = toIpcError(undefined, { isDomainError });

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('undefined');
    });
  });

  describe('metadata merging', () => {
    it('omits metadata field when metadata is an empty object', () => {
      const error = new Error('test');
      const result = toIpcError(error, { isDomainError, metadata: {} });

      expect(result.metadata).toBeUndefined();
    });

    it('omits metadata when DomainError has no metadata and no caller metadata is provided', () => {
      const domainError = sessionNotFound();
      const result = toIpcError(domainError, { isDomainError });

      expect(result.metadata).toBeUndefined();
    });
  });
  describe('environment', () => {
    it('omits the stack trace when the app is packaged', () => {
      electronApp.packaged = true;

      expect(toIpcError(sessionNotFound(), { isDomainError })).toEqual({
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found',
      });
    });

    it('includes the stack trace when the Electron app is not available', () => {
      electronApp.packaged = 'unavailable';

      expect(toIpcError(new Error('test'), { isDomainError }).stack).toEqual(expect.any(String));
    });
  });

  describe('domain error recognition', () => {
    it('treats an error as a domain error only when isDomainError accepts it', () => {
      const error = Object.assign(new Error('missing'), { code: 'ENOENT', metadata: { path: '/x' } });

      expect(toIpcError(error, { isDomainError })).toEqual({
        code: 'UNKNOWN_ERROR',
        message: 'missing',
        stack: error.stack,
      });
    });

    it('passes the normalized Error to isDomainError', () => {
      const received: Error[] = [];
      const recognize = (error: Error): error is TestDomainError => {
        received.push(error);
        return false;
      };

      toIpcError('string error', { isDomainError: recognize });

      expect(received).toHaveLength(1);
      expect(received[0]).toBeInstanceOf(Error);
      expect(received[0]!.message).toBe('string error');
    });
  });
});
