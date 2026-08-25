import type { LogLevel } from './LogLevel';

export function formatLogMessage(level: LogLevel, context: string, message: string): string {
  return `[${level}] [${context}] ${message}`;
}
