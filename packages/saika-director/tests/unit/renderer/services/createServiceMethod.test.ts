import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServiceMethod } from '@/renderer/services/createServiceMethod';
import type { Logger } from '@/shared/utils/Logger';

describe('createServiceMethod', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      logError: vi.fn(),
      userAction: vi.fn(),
      startTimer: vi.fn(),
    } as unknown as Logger;
  });

  describe('successful calls', () => {
    it('calls fn and returns its result', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const wrapped = createServiceMethod(mockLogger, 'testAction', fn);

      const result = await wrapped();

      expect(fn).toHaveBeenCalledOnce();
      expect(result).toBe('success');
    });

    it('returns an object from fn unchanged', async () => {
      const expected = { id: 1, name: 'test' };
      const fn = vi.fn().mockResolvedValue(expected);
      const wrapped = createServiceMethod(mockLogger, 'fetchData', fn);

      const result = await wrapped();

      expect(result).toEqual(expected);
    });

    it('does not call logger.logError on success', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const wrapped = createServiceMethod(mockLogger, 'testAction', fn);

      await wrapped();

      expect(mockLogger.logError).not.toHaveBeenCalled();
    });
  });

  describe('argument forwarding', () => {
    it('passes one argument to fn unchanged', async () => {
      const fn = vi.fn().mockResolvedValue(undefined);
      const wrapped = createServiceMethod(mockLogger, 'singleArg', fn);

      await wrapped('hello');

      expect(fn).toHaveBeenCalledWith('hello');
    });

    it('passes multiple arguments to fn unchanged', async () => {
      const fn = vi.fn().mockResolvedValue(undefined);
      const wrapped = createServiceMethod(mockLogger, 'multiArgs', fn);

      await wrapped('arg1', 42, true);

      expect(fn).toHaveBeenCalledWith('arg1', 42, true);
    });

    it('calls fn without arguments', async () => {
      const fn = vi.fn().mockResolvedValue('no-args');
      const wrapped = createServiceMethod(mockLogger, 'noArgs', fn);

      const result = await wrapped();

      expect(fn).toHaveBeenCalledWith();
      expect(result).toBe('no-args');
    });

    it('passes an object argument to fn unchanged', async () => {
      const payload = { id: 'abc', data: [1, 2, 3] };
      const fn = vi.fn().mockResolvedValue(undefined);
      const wrapped = createServiceMethod(mockLogger, 'objectArg', fn);

      await wrapped(payload);

      expect(fn).toHaveBeenCalledWith(payload);
    });
  });

  describe('error handling', () => {
    it('calls logger.logError when fn throws', async () => {
      const error = new Error('something went wrong');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = createServiceMethod(mockLogger, 'failingAction', fn);

      await expect(wrapped()).rejects.toThrow('something went wrong');
      expect(mockLogger.logError).toHaveBeenCalledOnce();
    });

    it('rethrows an error from fn', async () => {
      const error = new Error('original error');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = createServiceMethod(mockLogger, 'failingAction', fn);

      await expect(wrapped()).rejects.toThrow(error);
    });

    it('rethrows the original error object', async () => {
      expect.assertions(1);
      const error = new Error('identity check');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = createServiceMethod(mockLogger, 'failingAction', fn);

      try {
        await wrapped();
        expect.unreachable('Expected an error to be thrown');
      } catch (caught) {
        expect(caught).toBe(error);
      }
    });

    it('passes a correctly formatted error message to logger.logError', async () => {
      const error = new Error('test error');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = createServiceMethod(mockLogger, 'myAction', fn);

      await expect(wrapped()).rejects.toThrow();

      expect(mockLogger.logError).toHaveBeenCalledWith(
        'myAction failed',
        error,
        expect.objectContaining({ action: 'myAction' }),
      );
    });

    it('calls logger.logError when a non-Error value is thrown', async () => {
      const fn = vi.fn().mockRejectedValue('string error');
      const wrapped = createServiceMethod(mockLogger, 'stringError', fn);

      await expect(wrapped()).rejects.toBe('string error');
      expect(mockLogger.logError).toHaveBeenCalledWith(
        'stringError failed',
        'string error',
        expect.objectContaining({ action: 'stringError' }),
      );
    });
  });

  describe('error metadata', () => {
    it('includes actionName in metadata', async () => {
      const error = new Error('fail');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = createServiceMethod(mockLogger, 'importantAction', fn);

      await expect(wrapped()).rejects.toThrow();

      const logErrorCall = (mockLogger.logError as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const meta = logErrorCall[2] as Record<string, unknown>;
      expect(meta.action).toBe('importantAction');
    });

    it('logs only the action name as metadata', async () => {
      const error = new Error('fail');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = createServiceMethod(mockLogger, 'simpleAction', fn);

      await expect(wrapped()).rejects.toThrow();

      const logErrorCall = (mockLogger.logError as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const meta = logErrorCall[2] as Record<string, unknown>;
      expect(meta).toEqual({ action: 'simpleAction' });
    });
  });
});
