// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { invalidateAthleteTargetControl, refreshAthleteTargetControl } from '../stores/athleteTargetControl';
import { useCompetitionStore } from '../stores/competitionStore';

/** Refreshes the main-process projection, including automatic transitions that stay ACTIVE. */
export function useAthleteTargetEvents(): void {
  useEffect(() => {
    const refresh = () => {
      void refreshAthleteTargetControl();
    };
    const unsubscribeStore = useCompetitionStore.subscribe((current, previous) => {
      if (
        current.competitionId !== previous.competitionId ||
        current.phase !== previous.phase ||
        current.stageIndex !== previous.stageIndex ||
        current.seriesIndex !== previous.seriesIndex
      )
        refresh();
    });
    const unsubscribePhase = window.electronAPI.on.phaseChanged(refresh);
    const unsubscribeProgress = window.electronAPI.on.competitionProgressChanged((event) => {
      const state = useCompetitionStore.getState();
      if (event.competitionId !== state.competitionId) return;
      if (event.stageIndex === state.stageIndex && event.seriesIndex !== state.seriesIndex)
        state.advanceSeries(event.seriesIndex);
      refresh();
    });
    const unsubscribeShot = window.electronAPI.on.shotRecorded((event) => {
      // The projection's session identity is owned by the competition. Querying
      // also covers a newly activated session before renderer hydration finishes.
      if (event.sessionId) refresh();
    });
    const unsubscribeInterruption = window.electronAPI.on.competitionInterruptionChanged((event) => {
      if (event.competitionId === useCompetitionStore.getState().competitionId) refresh();
    });
    refresh();
    return () => {
      invalidateAthleteTargetControl();
      unsubscribeStore();
      unsubscribePhase();
      unsubscribeProgress();
      unsubscribeShot();
      unsubscribeInterruption();
    };
  }, []);
}
