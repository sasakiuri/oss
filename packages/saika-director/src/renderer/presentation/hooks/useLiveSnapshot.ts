import type { IpcErrorDto } from '@sasakiuri/saika-ipc';
import { useCallback, useEffect, useRef } from 'react';

import type { EventName } from '@/renderer/events/EventBus';
import { errorMessage } from '@/renderer/services/serviceError';
import type { IpcEvents } from '@/shared/ipc/contracts';

import { useEvent } from './useEvent';

type QueryResponse<T> = { success: true; data: T } | { success: false; error: IpcErrorDto };

export interface LiveSnapshotOptions<T> {
  /** Receives every live event and every query result that is still current. */
  readonly apply: (value: T, source: 'event' | 'query') => void;
  /**
   * Receives the message of a current failed query, and of a rejected mount query while mounted.
   * Without it, failures are ignored.
   */
  readonly onError?: (message: string) => void;
}

export interface LiveSnapshot {
  /** Queries again. A rejection propagates to the caller. */
  readonly refresh: () => Promise<void>;
  /** Outdates queries in flight, for other events that carry newer state. */
  readonly markLive: () => void;
}

/**
 * An initial query plus a live event for one piece of state. A query result is dropped after unmount, when a newer
 * refresh started, or when a live event (or `markLive()`) arrived after the query started.
 */
export function useLiveSnapshot<E extends EventName>(
  event: E,
  query: () => Promise<QueryResponse<IpcEvents[E]>>,
  options: LiveSnapshotOptions<IpcEvents[E]>,
): LiveSnapshot {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const queryRef = useRef(query);
  queryRef.current = query;
  const activeRef = useRef(false);
  const liveVersionRef = useRef(0);
  const requestIdRef = useRef(0);

  const markLive = useCallback(() => {
    liveVersionRef.current += 1;
  }, []);

  const refresh = useCallback(async () => {
    if (!activeRef.current) return;
    const requestId = ++requestIdRef.current;
    const liveVersion = liveVersionRef.current;
    const response = await queryRef.current();
    if (!activeRef.current || requestId !== requestIdRef.current || liveVersion !== liveVersionRef.current) return;
    if (response.success) optionsRef.current.apply(response.data, 'query');
    else optionsRef.current.onError?.(response.error.message);
  }, []);

  useEffect(() => {
    activeRef.current = true;
    refresh().catch((caught: unknown) => {
      if (activeRef.current) optionsRef.current.onError?.(errorMessage(caught));
    });
    return () => {
      activeRef.current = false;
      requestIdRef.current += 1;
    };
  }, [refresh]);

  useEvent(event, (value) => {
    liveVersionRef.current += 1;
    optionsRef.current.apply(value, 'event');
  });

  return { refresh, markLive };
}
