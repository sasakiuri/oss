import { Logger } from '@/shared/logging/Logger';
import type { LogTransport } from '@/shared/logging/LogTransport';

function createMockTransport(): LogTransport & { calls: Array<{ level: string; msg: string; args: unknown[] }> } {
  const calls: Array<{ level: string; msg: string; args: unknown[] }> = [];
  return {
    calls,
    write(level, msg, args) {
      calls.push({ level, msg, args });
    },
    flush: vi.fn(),
  };
}

describe('Logger', () => {
  it('logs messages at or above the minimum level', () => {
    const transport = createMockTransport();
    const logger = new Logger('Test', [transport], 'WARN');

    logger.debug('should be skipped');
    logger.info('should be skipped');
    logger.warn('warning');
    logger.error('error');

    expect(transport.calls).toHaveLength(2);
    expect(transport.calls[0]!.msg).toContain('[WARN]');
    expect(transport.calls[1]!.msg).toContain('[ERROR]');
  });

  it('formats messages with context', () => {
    const transport = createMockTransport();
    const logger = new Logger('MyCtx', [transport], 'DEBUG');

    logger.info('hello world');

    expect(transport.calls[0]!.msg).toBe('[INFO] [MyCtx] hello world');
  });

  it('passes args to transport', () => {
    const transport = createMockTransport();
    const logger = new Logger('Test', [transport], 'DEBUG');

    logger.info('msg', { key: 'val' });

    expect(transport.calls[0]!.args).toEqual([{ key: 'val' }]);
  });

  it('writes to multiple transports', () => {
    const t1 = createMockTransport();
    const t2 = createMockTransport();
    const logger = new Logger('Test', [t1, t2], 'DEBUG');

    logger.info('msg');

    expect(t1.calls).toHaveLength(1);
    expect(t2.calls).toHaveLength(1);
  });

  it('logError extracts error info', () => {
    const transport = createMockTransport();
    const logger = new Logger('Test', [transport], 'DEBUG');

    logger.logError('something failed', new Error('oops'));

    expect(transport.calls[0]!.level).toBe('ERROR');
    expect(transport.calls[0]!.args[0]).toMatchObject({
      errorMessage: 'oops',
      errorName: 'Error',
    });
  });

  it('logError handles non-Error values', () => {
    const transport = createMockTransport();
    const logger = new Logger('Test', [transport], 'DEBUG');

    logger.logError('fail', 'string error');

    expect(transport.calls[0]!.args[0]).toEqual({ errorValue: 'string error' });
  });

  it('userAction logs at INFO level', () => {
    const transport = createMockTransport();
    const logger = new Logger('Test', [transport], 'DEBUG');

    logger.userAction('clicked_button', { buttonId: 'save' });

    expect(transport.calls[0]!.level).toBe('INFO');
    expect(transport.calls[0]!.msg).toContain('[USER_ACTION] clicked_button');
    expect(transport.calls[0]!.args).toEqual([{ buttonId: 'save' }]);
  });

  it('startTimer returns a stop function that logs duration', () => {
    const transport = createMockTransport();
    const logger = new Logger('Test', [transport], 'DEBUG');

    const stop = logger.startTimer('myOp');
    stop();

    expect(transport.calls).toHaveLength(2);
    expect(transport.calls[0]!.msg).toContain('[TIMER] myOp started');
    expect(transport.calls[1]!.msg).toContain('[TIMER] myOp completed');
    expect(transport.calls[1]!.args[0]).toHaveProperty('durationMs');
  });

  it('flush delegates to transports', () => {
    const transport = createMockTransport();
    const logger = new Logger('Test', [transport], 'DEBUG');

    logger.flush();

    expect(transport.flush).toHaveBeenCalled();
  });

  describe('static backward compatibility', () => {
    it('Logger.create returns a Logger instance', () => {
      const logger = Logger.create('BackwardCompat');
      expect(logger).toBeInstanceOf(Logger);
    });
  });
});
