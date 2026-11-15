import type { ReactNode } from 'react';
import { useSystemEvents } from '../hooks/useSystemEvents';

export function EventSyncProvider({ children }: { children: ReactNode }) {
  useSystemEvents();
  return <>{children}</>;
}
