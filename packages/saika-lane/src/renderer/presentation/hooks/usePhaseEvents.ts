// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useCompetitionStore } from '../stores/competitionStore';

/**
 * Subscription to competition phase-related IPC events
 *
 * - phaseChanged: Phase/stage/series update (includes stage advancement)
 * - seriesCompleted: Advance to next series
 * - competitionStarted: Initialize competition state
 * - competitionFinished: End competition
 *
 * NOTE: The stageAdvanced event is not subscribed to. When a stage advances,
 * phaseChanged is always emitted, and applyPhaseChange updates
 * stageIndex/seriesIndex/stageName/scored/timer all in a single set() call,
 * avoiding duplicate advanceStage calls (double rendering).
 */
export function usePhaseEvents(): void {
  const applyPhaseChange = useCompetitionStore((s) => s.applyPhaseChange);
  const advanceSeries = useCompetitionStore((s) => s.advanceSeries);
  const resetCompetition = useCompetitionStore((s) => s.resetCompetition);
  const setCompetitionId = useCompetitionStore((s) => s.setCompetitionId);
  const setShotsPerSeries = useCompetitionStore((s) => s.setShotsPerSeries);
  const setAcc = useCompetitionStore((s) => s.setAcc);

  useEffect(() => {
    const unsubPhaseChanged = window.electronAPI.on.phaseChanged((data) => {
      applyPhaseChange(data.newPhase, data.stageIndex, data.seriesIndex, data.stageName, data.scored);
    });
    return () => unsubPhaseChanged();
  }, [applyPhaseChange]);

  useEffect(() => {
    const unsubSeriesCompleted = window.electronAPI.on.seriesCompleted((data) => {
      advanceSeries(data.seriesIndex + 1);
    });
    return () => unsubSeriesCompleted();
  }, [advanceSeries]);

  useEffect(() => {
    const unsubCompetitionStarted = window.electronAPI.on.competitionStarted((data) => {
      resetCompetition();
      setCompetitionId(data.competitionId);
      if (typeof data.shotsPerSeries === 'number') {
        setShotsPerSeries(data.shotsPerSeries);
      }
      setAcc(data.acc);
    });
    return () => unsubCompetitionStarted();
  }, [resetCompetition, setCompetitionId, setShotsPerSeries, setAcc]);

  useEffect(() => {
    const unsubCompetitionFinished = window.electronAPI.on.competitionFinished(() => {
      applyPhaseChange('FINISHED', 0, 0, '', false);
    });
    return () => unsubCompetitionFinished();
  }, [applyPhaseChange]);
}
