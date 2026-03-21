// SPDX-License-Identifier: MIT
import type { USBConnectionEvents } from './IUSBConnectionManager';

/**
 * USBEventEmitter
 *
 * Type-safe event emitter for USB connection events.
 * Provides event emission and subscription functionality for USBConnectionManager.
 */
export class USBEventEmitter {
  // Type safety is enforced by the generic on()/emit() public API.
  // (data: never) => void is the widest function type via contravariance.
  private listeners = new Map<keyof USBConnectionEvents, Set<(data: never) => void>>();

  /**
   * Register an event listener
   *
   * @param event - Event name
   * @param listener - Callback function
   * @returns Unsubscribe function
   */
  on<E extends keyof USBConnectionEvents>(event: E, listener: (data: USBConnectionEvents[E]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  /**
   * Emit an event
   *
   * @param event - Event name
   * @param args - Event data (can be omitted for void events)
   */
  emit<E extends keyof USBConnectionEvents>(
    event: E,
    ...args: USBConnectionEvents[E] extends void ? [] : [USBConnectionEvents[E]]
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        (listener as (data: USBConnectionEvents[E]) => void)(args[0] as USBConnectionEvents[E]);
      }
    }
  }
}
