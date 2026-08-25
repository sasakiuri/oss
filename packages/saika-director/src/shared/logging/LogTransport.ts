import type { LogLevel } from './LogLevel';

export interface LogTransport {
  write(level: LogLevel, formattedMessage: string, args: unknown[]): void;
  flush?(): void;
}
