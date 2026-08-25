import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from '@/shared/utils/Logger';

describe('Logger', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset logger configuration before each test
    Logger.configure({});

    // Spy on console methods
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('should create a logger with specified context', () => {
      const logger = Logger.create('TestContext');
      logger.info('Test message');
      expect(infoSpy).toHaveBeenCalledWith('[INFO] [TestContext] Test message');
    });
  });

  describe('log levels', () => {
    describe('debug', () => {
      it('should log debug messages to console.debug', () => {
        Logger.configure({ minLevel: 'DEBUG' });
        const logger = Logger.create('TestContext');
        logger.debug('Debug message');
        expect(debugSpy).toHaveBeenCalledWith('[DEBUG] [TestContext] Debug message');
      });

      it('should include additional arguments', () => {
        Logger.configure({ minLevel: 'DEBUG' });
        const logger = Logger.create('TestContext');
        const data = { key: 'value' };
        logger.debug('Debug message', data);
        expect(debugSpy).toHaveBeenCalledWith('[DEBUG] [TestContext] Debug message', data);
      });
    });

    describe('info', () => {
      it('should log info messages to console.info', () => {
        const logger = Logger.create('TestContext');
        logger.info('Info message');
        expect(infoSpy).toHaveBeenCalledWith('[INFO] [TestContext] Info message');
      });

      it('should include additional arguments', () => {
        const logger = Logger.create('TestContext');
        const data = { key: 'value' };
        logger.info('Info message', data);
        expect(infoSpy).toHaveBeenCalledWith('[INFO] [TestContext] Info message', data);
      });
    });

    describe('warn', () => {
      it('should log warning messages to console.warn', () => {
        const logger = Logger.create('TestContext');
        logger.warn('Warning message');
        expect(warnSpy).toHaveBeenCalledWith('[WARN] [TestContext] Warning message');
      });

      it('should include additional arguments', () => {
        const logger = Logger.create('TestContext');
        const error = new Error('test');
        logger.warn('Warning message', error);
        expect(warnSpy).toHaveBeenCalledWith('[WARN] [TestContext] Warning message', error);
      });
    });

    describe('error', () => {
      it('should log error messages to console.error', () => {
        const logger = Logger.create('TestContext');
        logger.error('Error message');
        expect(errorSpy).toHaveBeenCalledWith('[ERROR] [TestContext] Error message');
      });

      it('should include additional arguments', () => {
        const logger = Logger.create('TestContext');
        const error = new Error('Something went wrong');
        logger.error('Error occurred', error);
        expect(errorSpy).toHaveBeenCalledWith('[ERROR] [TestContext] Error occurred', error);
      });

      it('should include multiple additional arguments', () => {
        const logger = Logger.create('TestContext');
        logger.error('Error occurred', 'arg1', 'arg2', { key: 'value' });
        expect(errorSpy).toHaveBeenCalledWith('[ERROR] [TestContext] Error occurred', 'arg1', 'arg2', { key: 'value' });
      });
    });
  });

  describe('log level filtering', () => {
    it('should suppress DEBUG logs when minLevel is INFO', () => {
      Logger.configure({ minLevel: 'INFO' });
      const logger = Logger.create('TestContext');
      logger.debug('Debug message');
      logger.info('Info message');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalled();
    });

    it('should suppress DEBUG and INFO logs when minLevel is WARN', () => {
      Logger.configure({ minLevel: 'WARN' });
      const logger = Logger.create('TestContext');
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should only show ERROR logs when minLevel is ERROR', () => {
      Logger.configure({ minLevel: 'ERROR' });
      const logger = Logger.create('TestContext');
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should show all logs when minLevel is DEBUG', () => {
      Logger.configure({ minLevel: 'DEBUG' });
      const logger = Logger.create('TestContext');
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');
      expect(debugSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('console output control', () => {
    it('should not output to console when consoleOutput is false', () => {
      Logger.configure({ consoleOutput: false });
      const logger = Logger.create('TestContext');
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should output to console when consoleOutput is true', () => {
      Logger.configure({ consoleOutput: true, minLevel: 'DEBUG' });
      const logger = Logger.create('TestContext');
      logger.info('Info message');
      expect(infoSpy).toHaveBeenCalled();
    });
  });

  describe('production environment behavior', () => {
    // Note: Testing production environment behavior requires mocking process.env
    // which is complex in Vitest. These tests verify the configured behavior instead.

    it('should suppress DEBUG logs when configured as INFO (production-like)', () => {
      // Simulate production configuration
      Logger.configure({ minLevel: 'INFO' });
      const logger = Logger.create('TestContext');

      logger.debug('This should not appear');
      logger.info('This should appear');

      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalled();
    });

    it('should show all logs from INFO level and above in production-like config', () => {
      Logger.configure({ minLevel: 'INFO' });
      const logger = Logger.create('TestContext');

      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');

      expect(infoSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('message formatting', () => {
    it('should format messages with level and context', () => {
      Logger.configure({ minLevel: 'DEBUG' });
      const logger = Logger.create('MyComponent');
      logger.info('Test message');
      expect(infoSpy).toHaveBeenCalledWith('[INFO] [MyComponent] Test message');
    });

    it('should handle special characters in context', () => {
      const logger = Logger.create('Component:SubComponent');
      logger.info('Test');
      expect(infoSpy).toHaveBeenCalledWith('[INFO] [Component:SubComponent] Test');
    });

    it('should handle empty message', () => {
      const logger = Logger.create('TestContext');
      logger.info('');
      expect(infoSpy).toHaveBeenCalledWith('[INFO] [TestContext] ');
    });
  });

  describe('configuration', () => {
    it('should apply new configuration', () => {
      Logger.configure({ minLevel: 'DEBUG' });
      const logger = Logger.create('TestContext');

      logger.debug('First debug');
      expect(debugSpy).toHaveBeenCalled();

      debugSpy.mockClear();
      Logger.configure({ minLevel: 'ERROR' });

      logger.debug('Second debug');
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it('should allow reconfiguration multiple times', () => {
      const logger = Logger.create('TestContext');

      const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
      levels.forEach((level) => {
        Logger.configure({ minLevel: level });
        logger.error('Test');
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockClear();
      });
    });
  });
});
