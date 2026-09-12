// SPDX-License-Identifier: MIT
import { BrowserWindow } from 'electron';

import { eventsContract } from '@/shared/ipc/contracts';
import type { LogEntry, LogLevel, LogSource } from '@/shared/types/log';

import { Logger } from './Logger';

/** Writes Main Process logs to the console, Renderer, and Winston file logger. */
export class IpcLogger {
  private readonly mainWindow: BrowserWindow;
  private counter = 0;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  debug(message: string, source: LogSource = 'main', metadata?: Record<string, unknown>): void {
    this.log('debug', message, source, metadata);
  }

  info(message: string, source: LogSource = 'main', metadata?: Record<string, unknown>): void {
    this.log('info', message, source, metadata);
  }

  warn(message: string, source: LogSource = 'main', metadata?: Record<string, unknown>): void {
    this.log('warn', message, source, metadata);
  }

  error(message: string, source: LogSource = 'main', metadata?: Record<string, unknown>): void {
    this.log('error', message, source, metadata);
  }

  /** Checks Winston's active level before building expensive log metadata. */
  isLevelEnabled(level: LogLevel): boolean {
    return Logger.getInstance().isLevelEnabled(level);
  }

  private log(level: LogLevel, message: string, source: LogSource, metadata?: Record<string, unknown>): void {
    const entry = this.createLogEntry(level, message, source, metadata);
    this.logToConsole(entry);
    this.sendToRenderer(entry);
    this.writeToFile(entry);
  }

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

  private sendToRenderer(entry: LogEntry): void {
    if (this.mainWindow.isDestroyed()) {
      return;
    }

    this.mainWindow.webContents.send(eventsContract.channels.logMessage, { entry });
  }

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
