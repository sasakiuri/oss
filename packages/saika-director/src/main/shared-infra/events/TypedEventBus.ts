/**
 * Type-safe event bus.
 *
 * Derives event-to-payload mappings from EventRegistry so on() infers payload types from event names.
 */

import type { AnyDomainEvent, EventMap, EventName } from '@/main/domain/events';
import { Logger } from '@/shared/utils/Logger';

export interface IEventBus {
  emit(event: AnyDomainEvent): void;
  on(eventType: string, handler: (event: AnyDomainEvent) => void): () => void;
}

const logger = Logger.create('EventBus');

export class TypedEventBus implements IEventBus {
  private listeners = new Map<string, Set<(event: AnyDomainEvent) => void>>();

  emit(event: AnyDomainEvent): void {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          logger.logError('Error in event handler', err, { eventType: event.type });
        }
      }
    }
  }

  /**
   * Type-safe subscription with payload inference from the event name.
   */
  on<N extends EventName>(eventType: N, handler: (event: EventMap[N]) => void): () => void;
  /**
   * Legacy string-based IEventBus-compatible signature used during migration.
   */
  on(eventType: string, handler: (event: AnyDomainEvent) => void): () => void;
  on(eventType: string, handler: (event: AnyDomainEvent) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);
    return () => {
      this.listeners.get(eventType)?.delete(handler);
    };
  }
}
