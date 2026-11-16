// SPDX-License-Identifier: MIT
/**
 * Log levels. The IPC event schema validates against this list, so the type and the schema cannot drift.
 */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Log sources (origins). The IPC event schema validates against this list, so the type and the schema cannot drift.
 */
export const LOG_SOURCES = [
  'main', // Main Process general
  'ipc', // IPC communication
  'usb', // USB communication
  'domain', // Domain events
  'cqrs', // CQRS Bus (command/query)
  'module', // Module system
  'mqtt', // MQTT communication
  'renderer', // Renderer Process
] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

/**
 * Log entry
 */
export interface LogEntry {
  /** Unique ID (for sorting/keying) */
  readonly id: string;
  /** Timestamp (ISO 8601 format) */
  readonly timestamp: string;
  /** Log level */
  readonly level: LogLevel;
  /** Log message */
  readonly message: string;
  /** Log source */
  readonly source: LogSource;
  /** Additional data (optional) */
  readonly metadata?: Record<string, unknown>;
}
