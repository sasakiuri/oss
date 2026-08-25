export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};
