// SPDX-License-Identifier: MIT
import { BrowserWindow } from 'electron';

import { eventsContract } from '@/shared/ipc/contracts';
import type { LogEntry, LogLevel, LogSource } from '@/shared/types/log';

import { Logger } from './Logger';

/**
 * IpcLogger
 *
 * A logger that forwards logs from the Main Process to the Renderer Process.
 * Sends to BrowserWindow and also outputs to the console for development debugging.
 */
export class IpcLogger {
  private readonly mainWindow: BrowserWindow;
  private counter = 0;

  /**
   * Create an IpcLogger instance
   *
   * @param mainWindow - The BrowserWindow to send logs to
   */
  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * Output a debug log
   *
   * @param message - Log message
   * @param source - Log source
   * @param metadata - Optional additional information
   */
  debug(message: string, source: LogSource = 'main', metadata?: Record<string, unknown>): void {
    this.log('debug', message, source, metadata);
  }

  /**
   * Output an info log
   *
   * @param message - Log message
   * @param source - Log source
   * @param metadata - Optional additional information
   */
  info(message: string, source: LogSource = 'main', metadata?: Record<string, unknown>): void {
    this.log('info', message, source, metadata);
  }

  /**
   * Output a warn log
   *
   * @param message - Log message
   * @param source - Log source
   * @param metadata - Optional additional information
   */
  warn(message: string, source: LogSource = 'main', metadata?: Record<string, unknown>): void {
    this.log('warn', message, source, metadata);
  }

  /**
   * Output an error log
   *
   * @param message - Log message
   * @param source - Log source
   * @param metadata - Optional additional information
   */
  error(message: string, source: LogSource = 'main', metadata?: Record<string, unknown>): void {
    this.log('error', message, source, metadata);
  }

  /**
   * Determine whether logging at the specified level is enabled
   *
   * Based on Winston's level hierarchy, returns whether the specified log level
   * will be output with the current log level setting.
   * Used as a guard for debug logs that involve heavy string conversion.
   *
   * @param level - The log level to check
   * @returns true if enabled
   */
  isLevelEnabled(level: LogLevel): boolean {
    return Logger.getInstance().isLevelEnabled(level);
  }

  /**
   * Create and send a log entry
   *
   * @param level - Log level
   * @param message - Log message
   * @param source - Log source
   * @param metadata - Optional additional information
   * @private
   */
  private log(level: LogLevel, message: string, source: LogSource, metadata?: Record<string, unknown>): void {
    const entry = this.createLogEntry(level, message, source, metadata);
    this.logToConsole(entry);
    this.sendToRenderer(entry);
    this.writeToFile(entry);
  }

  /**
   * Write a log to the Winston file logger
   *
   * @param entry - The log entry to write
   * @private
   */
  private writeToFile(entry: LogEntry): void {
    try {
      Logger.getInstance().log(entry.level, entry.message, {
        source: entry.source,
        ...entry.metadata,
      });
    } catch {
      console.error(`[IpcLogger] Failed to write log to file: ${entry.message}`);
    }
  }

  /**
   * Create a LogEntry
   *
   * @param level - Log level
   * @param message - Log message
   * @param source - Log source
   * @param metadata - Optional additional information
   * @returns LogEntry
   * @private
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    source: LogSource,
    metadata?: Record<string, unknown>,
  ): LogEntry {
    return {
      id: `log-${Date.now()}-${this.counter++}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      source,
      metadata,
    };
  }

  /**
   * Send a log to the Renderer Process
   *
   * Skips sending if the window has already been destroyed.
   *
   * @param entry - The log entry to send
   * @private
   */
  private sendToRenderer(entry: LogEntry): void {
    if (this.mainWindow.isDestroyed()) {
      return;
    }

    this.mainWindow.webContents.send(eventsContract.channels.logMessage, { entry });
  }

  /**
   * Output a log to the console
   *
   * @param entry - The log entry to output
   * @private
   */
  private logToConsole(entry: LogEntry): void {
    const label = `[${entry.source}] ${entry.message}`;
    const args = entry.metadata ? [label, entry.metadata] : [label];

    switch (entry.level) {
      case 'debug':
        console.debug(...args);
        break;
      case 'info':
        console.info(...args);
        break;
      case 'warn':
        console.warn(...args);
        break;
      case 'error':
        console.error(...args);
        break;
      default:
        console.log(...args);
        break;
    }
  }
}
