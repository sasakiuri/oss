import { useState, useCallback, useRef, useEffect } from 'react';
import { useEvent } from './useEvent';
import { Logger } from '@/shared/utils/Logger';

const logger = Logger.create('useBoardLaneData');

export interface UseBoardLaneDataOptions<T> {
  loadFn: () => Promise<T[]>;
  debounceMs?: number;
  filterPatchFields?: string[];
  onTimerTick?: (data: { laneId: string; remainingTime: number; phase: string }) => void;
  onTimerExpired?: (data: { laneId: string; phase: string }) => void;
}

export interface UseBoardLaneDataResult<T> {
  data: T[];
  loading: boolean;
  refetch: () => void;
  setData: React.Dispatch<React.SetStateAction<T[]>>;
}

export function useBoardLaneData<T>(options: UseBoardLaneDataOptions<T>): UseBoardLaneDataResult<T> {
  const { loadFn, debounceMs = 300, filterPatchFields, onTimerTick, onTimerExpired } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const latestRequestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      latestRequestIdRef.current += 1;
    };
  }, []);

  const loadData = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current;
    try {
      const result = await loadFn();
      if (mountedRef.current && requestId === latestRequestIdRef.current) {
        setData(result);
      }
    } catch (error) {
      logger.error('Failed to load board data:', error);
    } finally {
      if (mountedRef.current && requestId === latestRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [loadFn]);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedLoad = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      loadData();
    }, debounceMs);
  }, [loadData, debounceMs]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEvent('laneControlUpdated', () => {
    debouncedLoad();
  });

  useEvent('laneControlPatched', (eventData) => {
    if (filterPatchFields && filterPatchFields.length > 0) {
      const patch = eventData.patch as Record<string, unknown>;
      const hasRelevantChange = filterPatchFields.some((field) => patch[field] !== undefined);
      if (!hasRelevantChange) return;
    }
    debouncedLoad();
  });

  useEvent('laneTimerTick', (tickData) => {
    if (onTimerTick) {
      onTimerTick({
        laneId: tickData.laneId,
        remainingTime: tickData.remainingTime,
        phase: tickData.phase,
      });
    }
  });

  useEvent('laneTimerExpired', (expiredData) => {
    if (onTimerExpired) {
      onTimerExpired({
        laneId: expiredData.laneId,
        phase: expiredData.phase,
      });
    }
  });

  return {
    data,
    loading,
    refetch: loadData,
    setData,
  };
}
