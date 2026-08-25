import { LOG_LEVEL_PRIORITY } from '@/shared/logging/LogLevel';
import type { LogLevel } from '@/shared/logging/LogLevel';

describe('LogLevel', () => {
  it('defines four log levels with ascending priority', () => {
    expect(LOG_LEVEL_PRIORITY.DEBUG).toBeLessThan(LOG_LEVEL_PRIORITY.INFO);
    expect(LOG_LEVEL_PRIORITY.INFO).toBeLessThan(LOG_LEVEL_PRIORITY.WARN);
    expect(LOG_LEVEL_PRIORITY.WARN).toBeLessThan(LOG_LEVEL_PRIORITY.ERROR);
  });

  it('covers all LogLevel values', () => {
    const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    for (const level of levels) {
      expect(LOG_LEVEL_PRIORITY[level]).toBeDefined();
    }
  });
});
