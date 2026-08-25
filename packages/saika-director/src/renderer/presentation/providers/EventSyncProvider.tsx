import type { ReactNode } from 'react';
import { useSystemEvents } from '../hooks/useSystemEvents';
import { useLaneControlEvents } from '../hooks/useLaneControlEvents';
import { useLaneControlActions } from '../hooks/useLaneControlActions';

export function EventSyncProvider({ children }: { children: ReactNode }) {
  useSystemEvents();
  const { loadState } = useLaneControlActions();
  useLaneControlEvents(loadState);
  return <>{children}</>;
}
