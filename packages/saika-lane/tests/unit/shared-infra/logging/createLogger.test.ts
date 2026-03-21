// SPDX-License-Identifier: MIT
import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getLogger, initializeLogger, resetLogger } from '@/main/shared-infra/logging/createLogger';
import { IpcLogger } from '@/main/shared-infra/logging/IpcLogger';

function createMockBrowserWindow(): BrowserWindow {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      send: vi.fn(),
    },
  } as unknown as BrowserWindow;
}

describe('createLogger', () => {
  beforeEach(() => {
    resetLogger();
  });

  describe('initializeLogger', () => {
    it('should create an IpcLogger instance', () => {
      const mockWindow = createMockBrowserWindow();
      const logger = initializeLogger(mockWindow);

      expect(logger).toBeInstanceOf(IpcLogger);
    });

    it('should return the same instance on subsequent calls (singleton)', () => {
      const mockWindow1 = createMockBrowserWindow();
      const mockWindow2 = createMockBrowserWindow();

      const logger1 = initializeLogger(mockWindow1);
      const logger2 = initializeLogger(mockWindow2);

      expect(logger1).toBe(logger2);
    });
  });

  describe('getLogger', () => {
    it('should return the initialized logger', () => {
      const mockWindow = createMockBrowserWindow();
      const initialized = initializeLogger(mockWindow);
      const retrieved = getLogger();

      expect(retrieved).toBe(initialized);
    });

    it('should throw LOGGER_NOT_INITIALIZED when not initialized', () => {
      expect(() => getLogger()).toThrow('Logger has not been initialized');
    });
  });

  describe('resetLogger', () => {
    it('should clear the logger instance', () => {
      const mockWindow = createMockBrowserWindow();
      initializeLogger(mockWindow);
      resetLogger();

      expect(() => getLogger()).toThrow();
    });
  });
});
