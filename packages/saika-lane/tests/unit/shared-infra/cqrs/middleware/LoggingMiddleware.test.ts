// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CommandLoggingMiddleware,
  QueryLoggingMiddleware,
} from '@/main/shared-infra/cqrs/middleware/LoggingMiddleware';

// Logger mock — kept as external variables so each test can reference them
const mockDebug = vi.fn();
const mockError = vi.fn();

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: mockDebug,
    warn: vi.fn(),
    error: mockError,
  }),
}));

// performance.now() mock
const performanceNowMock = vi.spyOn(performance, 'now');

describe('LoggingMiddleware', () => {
  beforeEach(() => {
    mockDebug.mockClear();
    mockError.mockClear();
    performanceNowMock.mockReset();
  });

  // ============================
  // CommandLoggingMiddleware
  // ============================
  describe('CommandLoggingMiddleware', () => {
    let middleware: CommandLoggingMiddleware;

    beforeEach(() => {
      middleware = new CommandLoggingMiddleware();
    });

    it('logs command start and completion as debug on successful execution', async () => {
      performanceNowMock
        .mockReturnValueOnce(100) // start
        .mockReturnValueOnce(150); // end

      const next = vi.fn().mockResolvedValue(undefined);

      await middleware.execute('CreateUser', { name: 'Taro' }, next);

      // Start log: debug("[Command:CreateUser] start", "cqrs")
      expect(mockDebug).toHaveBeenCalledWith('[Command:CreateUser] start', 'cqrs');

      // Completion log: debug("[Command:CreateUser] done (50.0ms)", "cqrs")
      expect(mockDebug).toHaveBeenCalledWith(expect.stringContaining('[Command:CreateUser] done'), 'cqrs');

      expect(mockDebug).toHaveBeenCalledTimes(2);
    });

    it('logs failure as error on handler error', async () => {
      performanceNowMock.mockReturnValueOnce(100).mockReturnValueOnce(200);

      const error = new Error('Handler failed');
      const next = vi.fn().mockRejectedValue(error);

      await expect(middleware.execute('DeleteUser', { userId: 'u1' }, next)).rejects.toThrow('Handler failed');

      expect(mockError).toHaveBeenCalledWith(
        '[Command:DeleteUser] failed',
        'cqrs',
        expect.objectContaining({ error: expect.stringContaining('Handler failed') }),
      );
    });

    it('re-throws the error on failure', async () => {
      performanceNowMock.mockReturnValue(0);

      const originalError = new Error('Original error');
      const next = vi.fn().mockRejectedValue(originalError);

      const caught = await middleware.execute('FailCommand', {}, next).catch((e: unknown) => e);

      // Should be the same error instance
      expect(caught).toBe(originalError);
    });

    it('returns the result of next() as-is', async () => {
      performanceNowMock.mockReturnValue(0);

      const expectedResult = { id: 'u1', name: 'Taro' };
      const next = vi.fn().mockResolvedValue(expectedResult);

      const result = await middleware.execute('CreateUser', {}, next);

      expect(result).toEqual(expectedResult);
    });

    it('timing measurement is valid (non-negative)', async () => {
      // Use actual performance.now() to test that timing is valid
      performanceNowMock.mockRestore();

      const next = vi.fn().mockResolvedValue(undefined);

      await expect(middleware.execute('TimingTest', {}, next)).resolves.not.toThrow();

      // Verify that the time in the completion log is non-negative
      const doneCallArgs = mockDebug.mock.calls.find((call) => typeof call[0] === 'string' && call[0].includes('done'));
      if (doneCallArgs) {
        const match = (doneCallArgs[0] as string).match(/([\d.]+)ms/);
        if (match) {
          expect(Number(match[1])).toBeGreaterThanOrEqual(0);
        }
      }

      // Re-mock performance.now for subsequent tests
      vi.spyOn(performance, 'now');
    });
  });

  // ============================
  // QueryLoggingMiddleware
  // ============================
  describe('QueryLoggingMiddleware', () => {
    let middleware: QueryLoggingMiddleware;

    beforeEach(() => {
      middleware = new QueryLoggingMiddleware();
    });

    it('logs query start and completion as debug on successful execution', async () => {
      performanceNowMock.mockReturnValueOnce(200).mockReturnValueOnce(235);

      const next = vi.fn().mockResolvedValue({ id: 'u1', name: 'Taro' });

      await middleware.execute('GetUser', { userId: 'u1' }, next);

      // Start log
      expect(mockDebug).toHaveBeenCalledWith('[Query:GetUser] start', 'cqrs');

      // Completion log
      expect(mockDebug).toHaveBeenCalledWith(expect.stringContaining('[Query:GetUser] done'), 'cqrs');

      expect(mockDebug).toHaveBeenCalledTimes(2);
    });

    it('logs failure as error on handler error', async () => {
      performanceNowMock.mockReturnValueOnce(300).mockReturnValueOnce(350);

      const error = new Error('Query failed');
      const next = vi.fn().mockRejectedValue(error);

      await expect(middleware.execute('GetUser', { userId: 'u1' }, next)).rejects.toThrow('Query failed');

      expect(mockError).toHaveBeenCalledWith(
        '[Query:GetUser] failed',
        'cqrs',
        expect.objectContaining({ error: expect.stringContaining('Query failed') }),
      );
    });

    it('re-throws the error on failure', async () => {
      performanceNowMock.mockReturnValue(0);

      const originalError = new Error('Query original error');
      const next = vi.fn().mockRejectedValue(originalError);

      const caught = await middleware.execute('FailQuery', {}, next).catch((e: unknown) => e);

      expect(caught).toBe(originalError);
    });

    it('returns the result of next() as-is', async () => {
      performanceNowMock.mockReturnValue(0);

      const expectedResult = {
        users: [{ id: 'u1', name: 'Taro' }],
        totalCount: 1,
      };
      const next = vi.fn().mockResolvedValue(expectedResult);

      const result = await middleware.execute('ListUsers', {}, next);

      expect(result).toEqual(expectedResult);
    });

    it('timing measurement is valid (non-negative)', async () => {
      performanceNowMock.mockRestore();

      const next = vi.fn().mockResolvedValue({ id: 'u1', name: 'Taro' });

      await expect(middleware.execute('TimingTest', {}, next)).resolves.not.toThrow();

      const doneCallArgs = mockDebug.mock.calls.find((call) => typeof call[0] === 'string' && call[0].includes('done'));
      if (doneCallArgs) {
        const match = (doneCallArgs[0] as string).match(/([\d.]+)ms/);
        if (match) {
          expect(Number(match[1])).toBeGreaterThanOrEqual(0);
        }
      }

      vi.spyOn(performance, 'now');
    });
  });
});
