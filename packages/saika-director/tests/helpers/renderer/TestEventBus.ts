import type { EventBus, EventName, EventHandler } from '@/renderer/events/EventBus';

/**
 * In-memory EventBus for renderer tests.
 *
 * `emit()` fires events without `window.electronAPI`; `getSubscriptionCount()` checks that hooks release
 * their listeners.
 */
export class TestEventBus implements EventBus {
  private listeners = new Map<string, Set<(data: unknown) => void>>();

  subscribe<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    const wrappedHandler = (data: unknown): void => {
      handler(data as Parameters<EventHandler<E>>[0]);
    };
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(wrappedHandler);

    return () => {
      const set = this.listeners.get(event);
      if (set) {
        set.delete(wrappedHandler);
        if (set.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  getSubscriptionCount(event?: EventName): number {
    if (event) {
      return this.listeners.get(event)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }

  emit<E extends EventName>(event: E, data: Parameters<EventHandler<E>>[0]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }
  }
}
