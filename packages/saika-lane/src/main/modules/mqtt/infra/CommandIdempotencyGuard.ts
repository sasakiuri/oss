// SPDX-License-Identifier: MIT
/**
 * Command Idempotency Guard
 *
 * Prevents duplicate execution by commandId. Automatically expires after TTL (5 minutes).
 */
export class CommandIdempotencyGuard {
  private readonly processed: Map<string, Date> = new Map();
  private readonly ttlMs: number;

  constructor(ttlMs: number = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Checks whether the command has already been processed, and marks it if not
   * @returns true if already processed (should skip), false if new
   */
  check(commandId: string): boolean {
    this.cleanup();
    if (this.processed.has(commandId)) {
      return true;
    }
    this.processed.set(commandId, new Date());
    return false;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, date] of this.processed) {
      if (now - date.getTime() > this.ttlMs) {
        this.processed.delete(id);
      }
    }
  }

  get size(): number {
    return this.processed.size;
  }

  clear(): void {
    this.processed.clear();
  }
}
