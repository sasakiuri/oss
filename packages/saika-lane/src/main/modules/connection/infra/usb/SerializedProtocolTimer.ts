// SPDX-License-Identifier: MIT
export interface ProtocolTimerClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

interface ScheduledOperation {
  readonly isCurrent: () => boolean;
  readonly run: () => void | Promise<void>;
  readonly onError: (error: unknown) => void;
}

/**
 * Owns one replaceable deadline. Work runs on the protocol's existing queue and
 * remains cancellable after the timeout fires, until the queued operation starts.
 */
export class SerializedProtocolTimer {
  private handle: unknown = null;
  private revision = 0;

  constructor(
    private readonly clock: ProtocolTimerClock,
    private readonly runSerialized: (operation: () => Promise<void>) => Promise<void>,
  ) {}

  schedule(delayMs: number, operation: ScheduledOperation): void {
    this.cancel();
    const revision = this.revision;
    this.handle = this.clock.setTimeout(() => {
      if (revision !== this.revision) return;
      this.handle = null;
      void this.runSerialized(async () => {
        if (revision !== this.revision || !operation.isCurrent()) return;
        await operation.run();
      }).catch(operation.onError);
    }, delayMs);
  }

  cancel(): void {
    // A fired timeout can still be waiting behind a serial write/drain.
    this.revision += 1;
    if (this.handle !== null) {
      this.clock.clearTimeout(this.handle);
      this.handle = null;
    }
  }
}
