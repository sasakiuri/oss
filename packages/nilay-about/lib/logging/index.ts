/**
 * Structured logging utilities
 *
 * Provides consistent, structured logging across the application
 */

import { sanitizeForLogging } from "@/lib/security";
import { isDevelopment, isProduction } from "@/lib/env";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Format log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
  if (isDevelopment) {
    // Pretty format for development
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      entry.message,
    ];

    if (entry.context) {
      parts.push(JSON.stringify(sanitizeForLogging(entry.context), null, 2));
    }

    if (entry.error) {
      parts.push(`\nError: ${entry.error.name}: ${entry.error.message}`);
      if (entry.error.stack) {
        parts.push(`\n${entry.error.stack}`);
      }
    }

    return parts.join(" ");
  }

  // JSON format for production (for log aggregation)
  return JSON.stringify(sanitizeForLogging(entry as unknown as Record<string, unknown>));
}

/**
 * Create a log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: Error
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (context) {
    entry.context = context;
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: isDevelopment ? error.stack : undefined,
    };
  }

  return entry;
}

/**
 * Logger instance
 */
export const logger = {
  debug(message: string, context?: LogContext): void {
    if (!isDevelopment) return;
    const entry = createLogEntry("debug", message, context);
    console.debug(formatLogEntry(entry));
  },

  info(message: string, context?: LogContext): void {
    const entry = createLogEntry("info", message, context);
    console.info(formatLogEntry(entry));
  },

  warn(message: string, context?: LogContext): void {
    const entry = createLogEntry("warn", message, context);
    console.warn(formatLogEntry(entry));
  },

  error(message: string, error?: Error, context?: LogContext): void {
    const entry = createLogEntry("error", message, context, error);
    console.error(formatLogEntry(entry));
  },
};

/**
 * Create a child logger with preset context
 */
export function createLogger(baseContext: LogContext) {
  return {
    debug(message: string, context?: LogContext): void {
      logger.debug(message, { ...baseContext, ...context });
    },

    info(message: string, context?: LogContext): void {
      logger.info(message, { ...baseContext, ...context });
    },

    warn(message: string, context?: LogContext): void {
      logger.warn(message, { ...baseContext, ...context });
    },

    error(message: string, error?: Error, context?: LogContext): void {
      logger.error(message, error, { ...baseContext, ...context });
    },
  };
}

/**
 * Log and rethrow an error (useful in catch blocks)
 */
export function logAndRethrow(
  message: string,
  error: unknown,
  context?: LogContext
): never {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error(message, err, context);
  throw err;
}
