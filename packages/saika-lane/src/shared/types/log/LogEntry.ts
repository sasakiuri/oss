// SPDX-License-Identifier: MIT
/**
 * Log level
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log source (origin)
 */
export type LogSource =
  | 'main' // Main Process general
  | 'ipc' // IPC communication
  | 'usb' // USB communication
  | 'domain' // Domain events
  | 'cqrs' // CQRS Bus (command/query)
  | 'module' // Module system
  | 'mqtt' // MQTT communication
  | 'renderer'; // Renderer Process

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
