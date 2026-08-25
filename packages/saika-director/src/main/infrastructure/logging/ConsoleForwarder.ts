import { inspect } from 'node:util';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

export class ConsoleForwarder {
  private originalLog: typeof console.log;
  private originalError: typeof console.error;
  private originalWarn: typeof console.warn;

  constructor(private readonly eventBus: IEventBus) {
    this.originalLog = console.log.bind(console);
    this.originalError = console.error.bind(console);
    this.originalWarn = console.warn.bind(console);
  }

  start(): void {
    console.log = (...args: unknown[]) => {
      this.originalLog(...args);
      this.emitLog(args);
    };

    console.error = (...args: unknown[]) => {
      this.originalError(...args);
      this.emitLog(args, 'ERROR');
    };

    console.warn = (...args: unknown[]) => {
      this.originalWarn(...args);
      this.emitLog(args, 'WARN');
    };
  }

  stop(): void {
    console.log = this.originalLog;
    console.error = this.originalError;
    console.warn = this.originalWarn;
  }

  private safeStringify(arg: unknown): string {
    if (typeof arg !== 'object' || arg === null) {
      return String(arg);
    }
    try {
      return JSON.stringify(arg);
    } catch {
      return inspect(arg, { depth: 2 });
    }
  }

  private emitLog(args: unknown[], prefix?: string): void {
    const raw = args.map((arg) => this.safeStringify(arg)).join(' ');

    this.eventBus.emit({
      type: 'DebugLogEmitted',
      timestamp: Date.now(),
      direction: 'LOG',
      raw: prefix ? `[${prefix}] ${raw}` : raw,
    });
  }
}
