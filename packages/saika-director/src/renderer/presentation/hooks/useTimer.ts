import { useMemo } from 'react';
import { useTimerStore } from '../stores/system/timer.store';

export function useTimer() {
  const store = useTimerStore();

  const formatted = useMemo(() => {
    const minutes = Math.floor(store.remainingTime / 60);
    const seconds = store.remainingTime % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [store.remainingTime]);

  return {
    ...store,
    formatted,
  };
}
