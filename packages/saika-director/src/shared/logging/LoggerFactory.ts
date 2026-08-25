import type { LogLevel } from './LogLevel';
import type { LogTransport } from './LogTransport';
import { ConsoleTransport } from './ConsoleTransport';
import { Logger } from './Logger';
import type { LoggerConfig } from './Logger';

function isProduction(): boolean {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return true;
  }
  if (typeof import.meta !== 'undefined' && (import.meta as { env?: { PROD?: boolean } }).env?.PROD) {
    return true;
  }
  return false;
}

export class LoggerFactory {
  private readonly transports: LogTransport[];
  private readonly minLevel: LogLevel;

  constructor(config: LoggerConfig = {}) {
    this.minLevel = config.minLevel ?? (isProduction() ? 'INFO' : 'DEBUG');
    this.transports = [];

    if (config.consoleOutput ?? true) {
      this.transports.push(new ConsoleTransport());
    }

    if (config.fileTransport) {
      this.transports.push(config.fileTransport);
    }
  }

  create(context: string): Logger {
    return new Logger(context, this.transports, this.minLevel);
  }

  flush(): void {
    for (const transport of this.transports) {
      transport.flush?.();
    }
  }
}
