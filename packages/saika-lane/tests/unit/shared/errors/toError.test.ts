// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { toError } from '@/shared/errors/toError';

describe('toError', () => {
  it('returns an Error instance as-is', () => {
    const err = new Error('original');
    expect(toError(err)).toBe(err);
  });

  it('returns Error subclasses such as TypeError as-is', () => {
    const err = new TypeError('type error');
    expect(toError(err)).toBe(err);
  });

  it('converts a string to an Error', () => {
    const result = toError('something went wrong');
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('something went wrong');
  });

  it('converts a number to an Error', () => {
    const result = toError(42);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('42');
  });

  it('converts null to an Error', () => {
    const result = toError(null);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('null');
  });

  it('converts undefined to an Error', () => {
    const result = toError(undefined);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('undefined');
  });

  it('converts an object to an Error', () => {
    const result = toError({ key: 'value' });
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('[object Object]');
  });

  it('converts a Symbol to an Error', () => {
    const result = toError(Symbol('test'));
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Symbol(test)');
  });
});
