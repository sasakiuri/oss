// SPDX-License-Identifier: MIT
/** Infers event payload types from EventRegistry. emit() invokes listeners synchronously. */

import { getLogger } from '@/main/shared-infra/logging/createLogger';

import type { AnyDomainEvent, EventMap, EventName } from './EventBus';

import './coreEvents';

export interface IEventBus {
  emit(event: AnyDomainEvent): void;
  on<N extends EventName>(eventType: N, handler: (event: EventMap[N]) => void): () => void;
  on(eventType: string, handler: (event: AnyDomainEvent) => void): () => void;
}

export class TypedEventBus implements IEventBus {
  private listeners = new Map<string, Set<(event: AnyDomainEvent) => void>>();

  emit(event: AnyDomainEvent): void {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          const logger = getLogger();
          logger.error(
            `Error in event handler for ${event.type}`,
            'domain',
            err instanceof Error ? { error: err.stack } : { error: String(err) },
          );
        }
      }
    }
  }

  on<N extends EventName>(eventType: N, handler: (event: EventMap[N]) => void): () => void;
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

  /** Clear all listeners (for testing) */
  clear(): void {
    this.listeners.clear();
  }
}
