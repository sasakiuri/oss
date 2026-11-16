import type { DebugLogEntry } from '@/shared/ipc/contracts/debug.contract';

export interface IDebugLogStore {
  addEntry(entry: DebugLogEntry): void;
  getEntries(): DebugLogEntry[];
  clear(): void;
}

const MAX_LOG_ENTRIES = 1000;

export class DebugLogStore implements IDebugLogStore {
  private entries: DebugLogEntry[] = [];

  addEntry(entry: DebugLogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries = this.entries.slice(-MAX_LOG_ENTRIES);
    }
  }

  getEntries(): DebugLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  log(direction: 'TX' | 'RX' | 'LOG', raw: string, parsed?: string): void {
    this.addEntry({
      timestamp: Date.now(),
      direction,
      raw,
      parsed,
    });
  }
}
