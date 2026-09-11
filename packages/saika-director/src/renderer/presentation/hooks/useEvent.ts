import { useEffect, useCallback, useRef, type DependencyList } from 'react';
import { useEventBus } from '@/renderer/events/EventBusProvider';
import type { EventName, EventHandler } from '@/renderer/events/EventBus';

/** Subscribes until unmount or a deps change. The callback ref updates without resubscribing. */
export function useEvent<E extends EventName>(event: E, handler: EventHandler<E>, deps: DependencyList = []): void {
  const bus = useEventBus();

  // Keep a mutable ref to the latest handler so the IPC subscription
  // can always call the most recent version without re-subscribing.
  const handlerRef = useRef<EventHandler<E>>(handler);
  handlerRef.current = handler;

  // Stable wrapper that delegates to the latest handler ref
  const stableHandler = useCallback((data: Parameters<EventHandler<E>>[0]) => {
    handlerRef.current(data);
  }, []);

  useEffect(() => {
    const unsubscribe = bus.subscribe(event, stableHandler as EventHandler<E>);
    return unsubscribe;
  }, [bus, event, stableHandler, ...deps]);
}
