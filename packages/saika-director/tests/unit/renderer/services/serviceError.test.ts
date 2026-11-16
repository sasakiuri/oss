import { describe, expect, it } from 'vitest';

import { errorMessage, ServiceError, unwrap, unwrapData } from '@/renderer/services/serviceError';

import { fail, ok } from '../../../helpers/renderer/serviceResponses';

describe('unwrap', () => {
  it('returns the data of a successful response', () => {
    expect(unwrap(ok({ id: 'case-1' }))).toEqual({ id: 'case-1' });
  });

  it('throws the response error message with its code and metadata', () => {
    const response = {
      success: false as const,
      error: { code: 'CONFLICT', message: 'The case changed', metadata: { revision: 4 } },
    };

    const thrown = captureError(() => unwrap(response, 'Case operation failed'));

    expect(thrown).toBeInstanceOf(ServiceError);
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toBe('The case changed');
    expect(thrown.code).toBe('CONFLICT');
    expect(thrown.metadata).toEqual({ revision: 4 });
  });

  it('uses the fallback only when the failed response has no error', () => {
    const thrown = captureError(() => unwrap({ success: false }, 'Unable to remove template'));

    expect(thrown.message).toBe('Unable to remove template');
    expect(thrown.code).toBeUndefined();
  });

  it('keeps an empty error message instead of the fallback, like `error?.message ?? fallback`', () => {
    expect(captureError(() => unwrap(fail(''), 'Operation failed')).message).toBe('');
  });

  it('throws a generic text without error or fallback, so the banner that shows it is not empty', () => {
    expect(captureError(() => unwrap({ success: false })).message).toBe('Request failed');
  });

  it('returns undefined data for a successful command without data', () => {
    expect(unwrap({ success: true })).toBeUndefined();
  });
});

describe('unwrapData', () => {
  it('returns the data of a successful response', () => {
    expect(unwrapData({ success: true, data: { id: 'a' } }, 'Operation failed')).toEqual({ id: 'a' });
  });

  it.each([[{ success: true }], [{ success: true, data: null }]])(
    'fails with the fallback text for a success without data',
    (response) => {
      const thrown = captureError(() => unwrapData(response, 'Operation failed'));
      expect(thrown).toBeInstanceOf(ServiceError);
      expect(thrown.message).toBe('Operation failed');
    },
  );

  it('fails like unwrap for a failed response', () => {
    expect(captureError(() => unwrapData(fail('Refused'), 'Operation failed')).message).toBe('Refused');
    expect(captureError(() => unwrapData({ success: false }, 'Operation failed')).message).toBe('Operation failed');
  });
});

describe('ServiceError', () => {
  it('prints like a plain Error so `String(caught)` texts stay the same', () => {
    expect(String(new ServiceError('Lane offline'))).toBe(String(new Error('Lane offline')));
  });
});

describe('errorMessage', () => {
  it('returns the message of an Error', () => {
    expect(errorMessage(new Error('Failed'), 'Fallback')).toBe('Failed');
    expect(errorMessage(new ServiceError('Rejected'))).toBe('Rejected');
  });

  it('returns the fallback for a non-Error value', () => {
    expect(errorMessage('text', 'Transfer failed')).toBe('Transfer failed');
  });

  it('converts a non-Error value to text without a fallback', () => {
    expect(errorMessage('text')).toBe('text');
    expect(errorMessage({ message: 'object' })).toBe('[object Object]');
    expect(errorMessage(undefined)).toBe('undefined');
  });
});

function captureError(action: () => unknown): ServiceError {
  try {
    action();
  } catch (caught) {
    return caught as ServiceError;
  }
  throw new Error('Expected a thrown error');
}
