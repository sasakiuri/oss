import type { LogLevel } from './LogLevel';
import { LOG_LEVEL_PRIORITY } from './LogLevel';
import type { LogTransport } from './LogTransport';
import { formatLogMessage } from './LogFormatter';
import { ConsoleTransport } from './ConsoleTransport';

export interface LogMetadata {
  entityId?: string;
  action?: string;
  source?: 'user' | 'system';
  [key: string]: unknown;
}

export interface LoggerConfig {
  /** Minimum log level to output. Defaults to 'DEBUG' in development, 'INFO' in production */
  minLevel?: LogLevel;
  /** Whether to output to console. Defaults to true */
  consoleOutput?: boolean;
  /** Whether to output to file. Defaults to false. Only works in main process */
  fileOutput?: boolean;
  /** Pre-constructed file transport. When provided, fileOutput flag is ignored */
  fileTransport?: LogTransport;
  /** Log directory path. Defaults to './logs' */
  logDirectory?: string;
  /** Log rotation configuration */
  rotation?: Partial<{ maxFileSize: number; maxFiles: number }>;
}

function isProduction(): boolean {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return true;
  }
  if (typeof import.meta !== 'undefined' && (import.meta as { env?: { PROD?: boolean } }).env?.PROD) {
    return true;
  }
  return false;
}

// Default factory state for backward compatibility
let defaultTransports: LogTransport[] | null = null;
let defaultMinLevel: LogLevel | null = null;

function buildTransports(config: LoggerConfig): LogTransport[] {
  const transports: LogTransport[] = [];

  if (config.consoleOutput ?? true) {
    transports.push(new ConsoleTransport());
  }

  if (config.fileTransport) {
    transports.push(config.fileTransport);
  }

  return transports;
}

function getDefaultTransports(): LogTransport[] {
  if (!defaultTransports) {
    defaultTransports = buildTransports({});
  }
  return defaultTransports;
}

function getDefaultMinLevel(): LogLevel {
  return defaultMinLevel ?? (isProduction() ? 'INFO' : 'DEBUG');
}

export class Logger {
  constructor(
    private readonly context: string,
    private readonly transports: LogTransport[] | null,
    private readonly minLevel: LogLevel | null,
  ) {}

  private getEffectiveMinLevel(): LogLevel {
    return this.minLevel ?? getDefaultMinLevel();
  }

  private getEffectiveTransports(): LogTransport[] {
    return this.transports ?? getDefaultTransports();
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.getEffectiveMinLevel()];
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) return;
    const formatted = formatLogMessage(level, this.context, message);
    for (const transport of this.getEffectiveTransports()) {
      transport.write(level, formatted, args);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('DEBUG', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('INFO', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('WARN', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('ERROR', message, ...args);
  }

  logError(message: string, error: unknown, metadata?: LogMetadata): void {
    const errorInfo = this.extractErrorInfo(error);
    this.log('ERROR', message, errorInfo, metadata);
  }

  private extractErrorInfo(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return {
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name,
      };
    }
    return { errorValue: String(error) };
  }

  userAction(action: string, details?: Record<string, unknown>): void {
    if (details) {
      this.log('INFO', `[USER_ACTION] ${action}`, details);
    } else {
      this.log('INFO', `[USER_ACTION] ${action}`);
    }
  }

  startTimer(operationName: string): () => void {
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.debug(`[TIMER] ${operationName} started`);

    return () => {
      const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const duration = endTime - startTime;
      this.debug(`[TIMER] ${operationName} completed`, { durationMs: duration.toFixed(2) });
    };
  }

  flush(): void {
    for (const transport of this.getEffectiveTransports()) {
      transport.flush?.();
    }
  }

  /**
   * Backward-compatible static factory method.
   * Creates a Logger using the default transports and min level.
   */
  static create(context: string): Logger {
    return new Logger(context, null, null);
  }

  /**
   * Backward-compatible static configure method.
   * Reconfigures the default transports and min level.
   */
  static configure(config: LoggerConfig): void {
    defaultMinLevel = config.minLevel ?? null;
    defaultTransports = buildTransports(config);
  }

  /**
   * Backward-compatible static flush method.
   * Flushes all default transports.
   */
  static flush(): void {
    if (defaultTransports) {
      for (const transport of defaultTransports) {
        transport.flush?.();
      }
    }
  }
}
