import type { EventBus, EventName, EventHandler } from './EventBus';
import { Logger } from '@/shared/utils/Logger';

const logger = Logger.create('ElectronEventBus');

/**
 * Subscription entry tracking the unsubscribe function.
 */
interface SubscriptionEntry {
  unsubscribe: () => void;
}

/** Tracks IPC subscriptions and releases them on unsubscribe or dispose. */
export class ElectronEventBus implements EventBus {
  private subscriptions = new Map<string, Set<SubscriptionEntry>>();
  private nextId = 0;

  /**
   * Subscribe to an IPC event.
   *
   * @returns An unsubscribe function. Calling it removes the handler and
   *          cleans up the internal tracking entry.
   */
  subscribe<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    const id = this.nextId++;
    const subscriptionKey = `${event}:${id}`;

    // Call the preload bridge to register the actual IPC listener
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ipcUnsubscribe = window.electronAPI.on[event](handler as any);

    const entry: SubscriptionEntry = { unsubscribe: ipcUnsubscribe };

    // Track the subscription
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }
    this.subscriptions.get(event)!.add(entry);

    logger.debug(`Subscribed to "${event}" (key=${subscriptionKey})`);

    // Return a cleanup function
    let cleaned = false;
    return () => {
      if (cleaned) return;
      cleaned = true;

      entry.unsubscribe();
      const entries = this.subscriptions.get(event);
      if (entries) {
        entries.delete(entry);
        if (entries.size === 0) {
          this.subscriptions.delete(event);
        }
      }
      logger.debug(`Unsubscribed from "${event}" (key=${subscriptionKey})`);
    };
  }

  /**
   * Unsubscribe all active subscriptions.
   * Useful for application-level teardown.
   */
  unsubscribeAll(): void {
    let count = 0;
    for (const [, entries] of this.subscriptions) {
      for (const entry of entries) {
        entry.unsubscribe();
        count++;
      }
      entries.clear();
    }
    this.subscriptions.clear();
    logger.info(`Unsubscribed all: ${count} subscription(s) cleaned up`);
  }

  /**
   * Get the number of active subscriptions for a given event,
   * or the total if no event is specified.
   */
  getSubscriptionCount(event?: EventName): number {
    if (event) {
      return this.subscriptions.get(event)?.size ?? 0;
    }
    let total = 0;
    for (const entries of this.subscriptions.values()) {
      total += entries.size;
    }
    return total;
  }
}
