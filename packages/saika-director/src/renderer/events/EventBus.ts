import type { IpcEvents } from '@/shared/ipc/contracts/events.contract';

/**
 * Event name type derived from the IpcEvents interface.
 */
export type EventName = keyof IpcEvents;

/**
 * Event handler type for a given event name.
 */
export type EventHandler<E extends EventName> = (data: IpcEvents[E]) => void;

/**
 * EventBus interface for renderer-process IPC event subscriptions.
 *
 * Provides a typed subscribe/unsubscribe API with active subscription tracking.
 */
export interface EventBus {
  subscribe<E extends EventName>(event: E, handler: EventHandler<E>): () => void;
  unsubscribeAll(): void;
  getSubscriptionCount(event?: EventName): number;
}
