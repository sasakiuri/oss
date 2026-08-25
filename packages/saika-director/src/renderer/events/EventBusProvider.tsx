import { createContext, useContext } from 'react';
import type { EventBus } from './EventBus';

const EventBusContext = createContext<EventBus | null>(null);

export function EventBusProvider({
  bus,
  children,
}: {
  bus: EventBus;
  children: React.ReactNode;
}) {
  return <EventBusContext.Provider value={bus}>{children}</EventBusContext.Provider>;
}

export function useEventBus(): EventBus {
  const bus = useContext(EventBusContext);
  if (!bus) throw new Error('useEventBus must be used within EventBusProvider');
  return bus;
}
