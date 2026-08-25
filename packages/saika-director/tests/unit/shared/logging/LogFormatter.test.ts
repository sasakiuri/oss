import { formatLogMessage } from '@/shared/logging/LogFormatter';

describe('formatLogMessage', () => {
  it('formats message with level and context', () => {
    expect(formatLogMessage('INFO', 'MyComponent', 'hello')).toBe('[INFO] [MyComponent] hello');
  });

  it('works with all log levels', () => {
    expect(formatLogMessage('DEBUG', 'Ctx', 'msg')).toBe('[DEBUG] [Ctx] msg');
    expect(formatLogMessage('WARN', 'Ctx', 'msg')).toBe('[WARN] [Ctx] msg');
    expect(formatLogMessage('ERROR', 'Ctx', 'msg')).toBe('[ERROR] [Ctx] msg');
  });
});
