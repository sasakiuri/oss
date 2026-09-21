/**
 * Structured logging utilities
 *
 * Provides consistent, structured logging across the application
 */

import 'server-only';

import { sanitizeForLogging } from '@/lib/security/sanitize-logging';
import { getClientIp } from '@/lib/server/request';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: Error;
}

/**
 * Format log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(sanitizeForLogging({ ...entry }), null, process.env.NODE_ENV === 'development' ? 2 : undefined);
}

/**
 * Create a log entry
 */
function createLogEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (context) {
    entry.context = context;
  }

  if (error) {
    entry.error = error;
  }

  return entry;
}

/**
 * Logger instance
 */
export const logger = {
  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'development') return;
    const entry = createLogEntry('debug', message, context);
    console.debug(formatLogEntry(entry));
  },

  info(message: string, context?: LogContext): void {
    const entry = createLogEntry('info', message, context);
    console.info(formatLogEntry(entry));
  },

  warn(message: string, context?: LogContext): void {
    const entry = createLogEntry('warn', message, context);
    console.warn(formatLogEntry(entry));
  },

  error(message: string, error?: Error, context?: LogContext): void {
    const entry = createLogEntry('error', message, context, error);
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
export function getRequestContext(request: Request): LogContext {
  const headers = request.headers;
  const url = new URL(request.url);

  return {
    requestId: headers.get('x-request-id') ?? headers.get('x-vercel-id') ?? crypto.randomUUID(),
    method: request.method,
    path: url.pathname,
    queryKeys: [...new Set(url.searchParams.keys())],
    userAgent: headers.get('user-agent') ?? undefined,
    ip: getClientIp(request),
  };
}

/**
 * Create a logger with request context
 */
export function createRequestLogger(request: Request) {
  const requestContext = getRequestContext(request);
  return createLogger(requestContext);
}
