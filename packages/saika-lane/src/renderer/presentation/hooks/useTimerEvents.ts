// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useCompetitionStore } from '../stores/competitionStore';

/**
 * Subscription to timer-related IPC events
 *
 * - timerTick: Timer remaining time update
 * - timerExpired: Timer expired
 */
export function useTimerEvents(): void {
  const updateTimer = useCompetitionStore((s) => s.updateTimer);
  const setTimerRunning = useCompetitionStore((s) => s.setTimerRunning);
  const setTimerExpired = useCompetitionStore((s) => s.setTimerExpired);
  const setInterruption = useCompetitionStore((s) => s.setInterruption);

  useEffect(() => {
    const unsubTimerTick = window.electronAPI.on.timerTick((data) => {
      updateTimer(data.remainingSeconds, data.totalSeconds);
    });
    return () => unsubTimerTick();
  }, [updateTimer]);

  useEffect(() => {
    const unsubTimerExpired = window.electronAPI.on.timerExpired(() => {
      setTimerRunning(false);
      setTimerExpired(true);
      setInterruption(null);
    });
    return () => unsubTimerExpired();
  }, [setTimerRunning, setTimerExpired, setInterruption]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.on.competitionInterruptionChanged((data) => {
      setInterruption({
        interruptionId: data.interruptionId,
        status: data.status,
        remainingSeconds: data.remainingSeconds,
        unlimitedSightingShots: data.unlimitedSightingShots,
      });
      setTimerRunning(data.status === 'SIGHTING' || data.status === 'RUNNING_MATCH');
    });
    return () => unsubscribe();
  }, [setInterruption, setTimerRunning]);
}
