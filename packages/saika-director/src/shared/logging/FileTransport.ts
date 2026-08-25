import fs from 'node:fs';
import path from 'node:path';

import type { LogTransport } from './LogTransport';
import { safeStringify } from './safeStringify';

interface LogRotationConfig {
  /** Maximum file size in bytes. Defaults to 10MB */
  maxFileSize: number;
  /** Maximum number of log files to keep. Defaults to 5 */
  maxFiles: number;
}

const DEFAULT_ROTATION_CONFIG: LogRotationConfig = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
};

export interface FileTransportConfig {
  logDirectory?: string;
  rotation?: Partial<LogRotationConfig>;
}

export class FileTransport implements LogTransport {
  private writeBuffer: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushIntervalMs = 100;
  private readonly logDirectory: string;
  private readonly rotationConfig: LogRotationConfig;

  constructor(config: FileTransportConfig = {}) {
    this.logDirectory = config.logDirectory ?? './logs';
    this.rotationConfig = {
      ...DEFAULT_ROTATION_CONFIG,
      ...config.rotation,
    };
  }

  write(_level: string, formattedMessage: string, args: unknown[]): void {
    try {
      const timestamp = new Date().toISOString();
      let logLine = `${timestamp} ${formattedMessage}`;

      if (args.length > 0) {
        const argsStr = args.map((arg) => safeStringify(arg)).join(' ');
        logLine += ` ${argsStr}`;
      }

      logLine += '\n';

      this.writeBuffer.push(logLine);
      this.scheduleFlush();
    } catch {
      console.error('[Logger] Failed to buffer log entry');
    }
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushBuffer();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushBuffer();
    }, this.flushIntervalMs);
  }

  private flushBuffer(): void {
    if (this.writeBuffer.length === 0) return;

    try {
      const logDir = this.logDirectory;
      const logFileName = `app-${this.getDateString()}.log`;
      const logFilePath = path.join(logDir, logFileName);

      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      this.rotateLogFiles(logDir, logFileName);

      const content = this.writeBuffer.join('');
      fs.appendFileSync(logFilePath, content, 'utf8');
      this.writeBuffer = [];

      // Periodically cleanup old files (1% chance per flush)
      if (Math.random() < 0.01) {
        this.cleanupOldLogFiles(logDir);
      }
    } catch {
      console.error('[Logger] Failed to flush log buffer');
    }
  }

  private getDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private rotateLogFiles(logDir: string, logFileName: string): void {
    const logFilePath = path.join(logDir, logFileName);

    try {
      if (!fs.existsSync(logFilePath)) {
        return;
      }

      const stats = fs.statSync(logFilePath);
      if (stats.size < this.rotationConfig.maxFileSize) {
        return;
      }

      const baseName = logFileName.replace('.log', '');

      const oldestFile = path.join(logDir, `${baseName}.${this.rotationConfig.maxFiles - 1}.log`);
      if (fs.existsSync(oldestFile)) {
        fs.unlinkSync(oldestFile);
      }

      for (let i = this.rotationConfig.maxFiles - 2; i >= 1; i--) {
        const oldPath = path.join(logDir, `${baseName}.${i}.log`);
        const newPath = path.join(logDir, `${baseName}.${i + 1}.log`);
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
        }
      }

      const rotatedPath = path.join(logDir, `${baseName}.1.log`);
      fs.renameSync(logFilePath, rotatedPath);
    } catch {
      console.error('[Logger] Failed to rotate log files');
    }
  }

  private cleanupOldLogFiles(logDir: string): void {
    try {
      const files = fs.readdirSync(logDir);
      const logFiles = files
        .filter((f) => f.startsWith('app-') && f.endsWith('.log'))
        .map((f) => ({
          name: f,
          path: path.join(logDir, f),
          mtime: fs.statSync(path.join(logDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime);

      const maxTotalFiles = this.rotationConfig.maxFiles * 2;
      if (logFiles.length > maxTotalFiles) {
        const filesToDelete = logFiles.slice(maxTotalFiles);
        for (const file of filesToDelete) {
          fs.unlinkSync(file.path);
        }
      }
    } catch {
      // Silently fail cleanup
    }
  }
}
