// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@/main/shared-infra/logging/Logger';

const paths = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => paths.userData },
}));

const ENV_NAMES = ['LOG_LEVEL', 'LOGS_DIR', 'NODE_ENV'] as const;

describe('Logger', () => {
  const originalEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));

  beforeAll(() => {
    paths.userData = mkdtempSync(join(tmpdir(), 'saika-lane-logger-'));
  });

  afterAll(() => {
    rmSync(paths.userData, { recursive: true, force: true });
  });

  beforeEach(() => {
    Logger.resetInstance();
    // Keep log files inside the temporary user-data directory.
    delete process.env.LOGS_DIR;
  });

  afterEach(() => {
    Logger.resetInstance();
    for (const name of ENV_NAMES) {
      // Assigning undefined would store the string "undefined".
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  });

  describe('getInstance', () => {
    it('should return a winston logger instance', () => {
      const logger = Logger.getInstance();

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should return the same instance on multiple calls (singleton)', () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();

      expect(logger1).toBe(logger2);
    });

    it('should use LOG_LEVEL env var for log level', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = Logger.getInstance();

      expect(logger.level).toBe('debug');
    });

    it('should default to info level when LOG_LEVEL is not set', () => {
      delete process.env.LOG_LEVEL;
      const logger = Logger.getInstance();

      expect(logger.level).toBe('info');
    });

    it('should set defaultMeta with service name', () => {
      const logger = Logger.getInstance();

      expect(logger.defaultMeta).toEqual({ service: 'saika-lane' });
    });
  });

  describe('resetInstance', () => {
    it('should clear the singleton instance', () => {
      const logger1 = Logger.getInstance();
      Logger.resetInstance();
      const logger2 = Logger.getInstance();

      expect(logger1).not.toBe(logger2);
    });
  });

  describe('addConsoleTransport', () => {
    it('should add console transport in non-production environment', () => {
      process.env.NODE_ENV = 'development';
      const logger = Logger.getInstance();
      const initialTransportCount = logger.transports.length;

      Logger.addConsoleTransport();

      expect(logger.transports.length).toBe(initialTransportCount + 1);
    });

    it('should not add console transport in production environment', () => {
      process.env.NODE_ENV = 'production';
      const logger = Logger.getInstance();
      const initialTransportCount = logger.transports.length;

      Logger.addConsoleTransport();

      expect(logger.transports.length).toBe(initialTransportCount);
    });
  });
});
