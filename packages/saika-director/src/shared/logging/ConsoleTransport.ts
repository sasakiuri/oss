import type { LogLevel } from './LogLevel';
import type { LogTransport } from './LogTransport';

export class ConsoleTransport implements LogTransport {
  write(level: LogLevel, formattedMessage: string, args: unknown[]): void {
    const method = this.getConsoleMethod(level);
    if (args.length > 0) {
      method(formattedMessage, ...args);
    } else {
      method(formattedMessage);
    }
  }

  private getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
    switch (level) {
      case 'DEBUG':
        return console.debug.bind(console);
      case 'INFO':
        return console.info.bind(console);
      case 'WARN':
        return console.warn.bind(console);
      case 'ERROR':
        return console.error.bind(console);
    }
  }
}
