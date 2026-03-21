// SPDX-License-Identifier: MIT
import path from 'path';

import { app } from 'electron';
import winston, { format } from 'winston';

/**
 * Logger
 *
 * Logging functionality using Winston.
 * Singleton logger used throughout the application.
 */
export class Logger {
  private static instance: winston.Logger | null = null;

  /**
   * Get the Logger instance (singleton)
   *
   * @returns Winston logger instance
   */
  static getInstance(): winston.Logger {
    if (!Logger.instance) {
      Logger.instance = Logger.createLogger();
    }
    return Logger.instance;
  }

  /**
   * Create a Winston logger
   *
   * @returns Winston logger instance
   */
  private static readonly VALID_LOG_LEVELS = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'] as const;

  private static createLogger(): winston.Logger {
    let resolvedPath: string;
    try {
      resolvedPath = path.join(app.getPath('userData'), 'logs');
    } catch {
      resolvedPath = './logs';
    }
    const logsDir = !app.isPackaged && process.env.LOGS_DIR ? process.env.LOGS_DIR : resolvedPath;

    const envLogLevel = process.env.LOG_LEVEL;
    const logLevel =
      envLogLevel && (Logger.VALID_LOG_LEVELS as readonly string[]).includes(envLogLevel) ? envLogLevel : 'info';

    return winston.createLogger({
      level: logLevel,
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.splat(),
        format.json(),
      ),
      defaultMeta: { service: 'saika-lane' },
      transports: [
        // File output (errors)
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
        // File output (all)
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
      ],
    });
  }

  /**
   * Add console output for the development environment
   */
  static addConsoleTransport(): void {
    if (process.env.NODE_ENV !== 'production') {
      Logger.getInstance().add(
        new winston.transports.Console({
          format: format.combine(format.colorize(), format.simple()),
        }),
      );
    }
  }

  /**
   * Reset the instance for testing
   * @internal
   */
  static resetInstance(): void {
    if (Logger.instance) {
      Logger.instance.close();
      Logger.instance = null;
    }
  }
}
