// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { DomainError } from '@/shared/errors/DomainError';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { isDomainError } from '@/shared/errors/isDomainError';

describe('isDomainError', () => {
  it('returns true for an error created by ErrorCatalog.createError', () => {
    const error = ErrorCatalog.createError('VALIDATION_ERROR', { field: 'test' });
    expect(isDomainError(error)).toBe(true);
  });

  it('returns true for an error created by DomainError.wrap', () => {
    const wrapped = DomainError.wrap(new Error('inner'), 'WRAP_TEST', 'test');
    expect(isDomainError(wrapped)).toBe(true);
  });

  it('returns false for a regular Error', () => {
    expect(isDomainError(new Error('plain'))).toBe(false);
  });

  it('returns false for a TypeError', () => {
    expect(isDomainError(new TypeError('type error'))).toBe(false);
  });

  it('returns false for a regular Error with a code property', () => {
    const error = Object.assign(new Error('with code'), { code: 'FAKE_CODE' });
    expect(isDomainError(error)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDomainError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isDomainError(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isDomainError('error string')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isDomainError(42)).toBe(false);
  });

  it('returns false for a plain object', () => {
    expect(isDomainError({ code: 'TEST', message: 'test' })).toBe(false);
  });
});
