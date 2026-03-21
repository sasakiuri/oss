// SPDX-License-Identifier: MIT
import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IpcLogger } from '@/main/shared-infra/logging/IpcLogger';
import { Logger } from '@/main/shared-infra/logging/Logger';

const mockWinstonLog = vi.fn();
vi.mock('@/main/shared-infra/logging/Logger', () => ({
  Logger: {
    getInstance: () => ({ log: mockWinstonLog }),
  },
}));

function createMockBrowserWindow(destroyed = false): BrowserWindow {
  return {
    isDestroyed: vi.fn().mockReturnValue(destroyed),
    webContents: {
      send: vi.fn(),
    },
  } as unknown as BrowserWindow;
}

describe('IpcLogger', () => {
  let mockWindow: BrowserWindow;
  let logger: IpcLogger;

  beforeEach(() => {
    mockWindow = createMockBrowserWindow();
    logger = new IpcLogger(mockWindow);
    mockWinstonLog.mockClear();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('log level methods', () => {
    it('should send debug log to renderer', () => {
      logger.debug('test debug');

      expect(mockWindow.webContents.send).toHaveBeenCalledTimes(1);
      const call = (mockWindow.webContents.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[0]).toBe('log:message');
      expect(call[1].entry.level).toBe('debug');
      expect(call[1].entry.message).toBe('test debug');
    });

    it('should send info log to renderer', () => {
      logger.info('test info');

      const call = (mockWindow.webContents.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[1].entry.level).toBe('info');
      expect(call[1].entry.message).toBe('test info');
    });

    it('should send warn log to renderer', () => {
      logger.warn('test warn');

      const call = (mockWindow.webContents.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[1].entry.level).toBe('warn');
      expect(call[1].entry.message).toBe('test warn');
    });

    it('should send error log to renderer', () => {
      logger.error('test error');

      const call = (mockWindow.webContents.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[1].entry.level).toBe('error');
      expect(call[1].entry.message).toBe('test error');
    });
  });

  describe('log entry creation', () => {
    it('should create LogEntry with correct fields', () => {
      logger.info('entry test', 'usb');

      const call = (mockWindow.webContents.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const entry = call[1].entry;

      expect(entry.id).toMatch(/^log-\d+-\d+$/);
      expect(entry.timestamp).toBeDefined();
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('entry test');
      expect(entry.source).toBe('usb');
    });

    it('should default source to main', () => {
      logger.info('default source');

      const call = (mockWindow.webContents.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[1].entry.source).toBe('main');
    });

    it('should include metadata when provided', () => {
      const meta = { key: 'value', count: 42 };
      logger.info('with meta', 'domain', meta);

      const call = (mockWindow.webContents.send as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[1].entry.metadata).toEqual(meta);
    });

    it('should increment counter for unique IDs', () => {
      logger.info('first');
      logger.info('second');

      const calls = (mockWindow.webContents.send as ReturnType<typeof vi.fn>).mock.calls;
      const id1 = calls[0]![1].entry.id;
      const id2 = calls[1]![1].entry.id;

      expect(id1).not.toBe(id2);
    });
  });

  describe('renderer communication', () => {
    it('should skip send when window is destroyed', () => {
      const destroyedWindow = createMockBrowserWindow(true);
      const destroyedLogger = new IpcLogger(destroyedWindow);

      destroyedLogger.info('should not send');

      expect(destroyedWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('should send on log:message channel', () => {
      logger.debug('channel test');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'log:message',
        expect.objectContaining({
          entry: expect.objectContaining({ message: 'channel test' }),
        }),
      );
    });
  });

  describe('console output', () => {
    it('should output to console.debug for debug level', () => {
      logger.debug('console debug');

      expect(console.debug).toHaveBeenCalledWith('[main] console debug');
    });

    it('should output to console.info for info level', () => {
      logger.info('console info');

      expect(console.info).toHaveBeenCalledWith('[main] console info');
    });

    it('should output to console.warn for warn level', () => {
      logger.warn('console warn');

      expect(console.warn).toHaveBeenCalledWith('[main] console warn');
    });

    it('should output to console.error for error level', () => {
      logger.error('console error');

      expect(console.error).toHaveBeenCalledWith('[main] console error');
    });

    it('should include metadata in console output when provided', () => {
      const meta = { detail: 'extra' };
      logger.info('with meta', 'ipc', meta);

      expect(console.info).toHaveBeenCalledWith('[ipc] with meta', meta);
    });
  });

  describe('file output', () => {
    it('should write to file via Winston logger', () => {
      logger.info('file test', 'domain', { key: 'value' });

      const winstonLog = (Logger.getInstance() as unknown as { log: ReturnType<typeof vi.fn> }).log;
      expect(winstonLog).toHaveBeenCalledWith('info', 'file test', {
        source: 'domain',
        key: 'value',
      });
    });

    it('should write to file without metadata', () => {
      logger.warn('no meta warn');

      const winstonLog = (Logger.getInstance() as unknown as { log: ReturnType<typeof vi.fn> }).log;
      expect(winstonLog).toHaveBeenCalledWith('warn', 'no meta warn', {
        source: 'main',
      });
    });

    it('should write all log levels to file', () => {
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');

      const winstonLog = (Logger.getInstance() as unknown as { log: ReturnType<typeof vi.fn> }).log;
      expect(winstonLog).toHaveBeenCalledTimes(4);
    });

    it('should not throw when Winston logger fails', () => {
      const winstonLog = (Logger.getInstance() as unknown as { log: ReturnType<typeof vi.fn> }).log;
      winstonLog.mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      expect(() => logger.info('should not throw')).not.toThrow();
    });

    it('should output to console.error when Winston logger fails', () => {
      const winstonLog = (Logger.getInstance() as unknown as { log: ReturnType<typeof vi.fn> }).log;
      winstonLog.mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      logger.info('fail message');

      expect(console.error).toHaveBeenCalledWith('[IpcLogger] Failed to write log to file: fail message');
    });
  });
});
