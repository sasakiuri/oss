// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { DomainError } from '@/shared/errors/DomainError';
import { withRepositoryErrorHandling } from '@/shared/errors/withRepositoryErrorHandling';

describe('withRepositoryErrorHandling', () => {
  it('returns the result as-is when fn succeeds', async () => {
    const result = await withRepositoryErrorHandling(async () => 42, 'STORAGE_READ_ERROR');
    expect(result).toBe(42);
  });

  it('wraps with DomainError when fn throws an Error', async () => {
    const original = new Error('disk failure');

    try {
      await withRepositoryErrorHandling(async () => {
        throw original;
      }, 'STORAGE_READ_ERROR');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      const domainErr = error as DomainError;
      expect(domainErr.code).toBe('STORAGE_READ_ERROR');
      expect(domainErr.cause).toBe(original);
    }
  });

  it('converts and wraps via toError when fn throws a string', async () => {
    try {
      await withRepositoryErrorHandling(async () => {
        throw 'string error';
      }, 'STORAGE_WRITE_ERROR');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      const domainErr = error as DomainError;
      expect(domainErr.code).toBe('STORAGE_WRITE_ERROR');
      expect(domainErr.cause).toBeInstanceOf(Error);
      expect(domainErr.cause!.message).toBe('string error');
    }
  });

  it('forwards metadata to createError when provided', async () => {
    try {
      await withRepositoryErrorHandling(
        async () => {
          throw new Error('fail');
        },
        'STORAGE_READ_ERROR',
        { key: 'settings' },
      );
    } catch (error) {
      const domainErr = error as DomainError;
      expect(domainErr.code).toBe('STORAGE_READ_ERROR');
      expect(domainErr.metadata).toEqual({ key: 'settings' });
    }
  });

  it('correctly returns async results from fn', async () => {
    const result = await withRepositoryErrorHandling(async () => ({ id: 'abc', name: 'test' }), 'STORAGE_READ_ERROR');
    expect(result).toEqual({ id: 'abc', name: 'test' });
  });
});
