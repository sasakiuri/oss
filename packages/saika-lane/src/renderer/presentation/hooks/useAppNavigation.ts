// SPDX-License-Identifier: MIT
/** Restores the main-owned run before leaving the minimum two-second splash. */
import { useCallback, useEffect, useState } from 'react';

import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { mergeShots, useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { competitionService } from '@/renderer/services/competitionService';
import { createVoidServiceMethod } from '@/renderer/services/createServiceMethod';
import { sessionService } from '@/renderer/services/sessionService';
import type { StartupStateDto } from '@/shared/ipc/contracts';
import { DisciplineSchema } from '@/shared/ipc/schemas/common';
import { isScoringGaugeProfileId, isTargetScoringProfileId } from '@/shared/target';

const getStartup = createVoidServiceMethod(() => window.electronAPI.startup.getStartupState());
const retryStartup = createVoidServiceMethod(() => window.electronAPI.startup.retryStartup());

export function useAppNavigation() {
  const [screen, setScreen] = useState<'splash' | 'main' | 'recovery'>('splash');
  const [startup, setStartup] = useState<StartupStateDto | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(async () => {
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let dirty = false;
    const markDirty = () => {
      dirty = true;
    };
    // Subscribe before any invoke, including readiness: live transitions may race the replies.
    const on = window.electronAPI.on;
    const unsubscribe = [
      on.competitionStarted,
      on.competitionFinished,
      on.phaseChanged,
      on.seriesCompleted,
      on.competitionInterruptionChanged,
      on.timerExpired,
      on.sessionStarted,
      on.modeSwitched,
      on.sessionReset,
      on.shotRecorded,
      on.positionExtraNullified,
    ].map((subscribe) => subscribe(markDirty));
    let splashTimer: ReturnType<typeof setTimeout>;
    const minimum = new Promise<void>((resolve) => {
      splashTimer = setTimeout(resolve, attempt === 0 ? 2000 : 0);
    });
    const hydrate = async (state: StartupStateDto, requery = false) => {
      if (state.status !== 'READY' || !state.competitionId || !state.sessionId) return;
      const [competition, history, score] = await Promise.all([
        competitionService.getCompetitionState({ competitionId: state.competitionId }),
        sessionService.getShotHistory({ sessionId: state.sessionId }),
        sessionService.getSessionScore({ sessionId: state.sessionId }),
      ]);
      if (cancelled || (dirty && !requery)) return;
      const previous = useSessionStore.getState();
      const shots = mergeShots(history.shots, previous.currentSessionId === state.sessionId ? previous.shots : []);
      useSessionStore.setState({
        currentSessionId: state.sessionId,
        discipline: DisciplineSchema.parse(score.discipline),
        mode:
          competition.athleteTargetControl?.effective ??
          (competition.interruption?.status === 'SIGHTING' ? 'SIGHTING' : competition.scored ? 'MATCH' : 'SIGHTING'),
        shots,
        nullifiedExtras: history.nullifiedExtras,
        currentSeriesStartIndex: state.currentSeriesStartIndex,
        totalScore: score.totalScore,
        seriesScores: score.seriesScores,
      });
      useCompetitionStore.setState({
        competitionId: competition.id,
        phase: competition.phase,
        stageIndex: competition.currentStageIndex,
        seriesIndex: competition.currentSeriesIndex,
        currentStageName: competition.currentStageName,
        scored: competition.scored,
        shotsPerSeries: competition.shotsPerSeries,
        acc: competition.acc,
        remainingSeconds: competition.timer.remainingSeconds,
        totalSeconds: competition.timer.totalSeconds,
        isTimerExpired: competition.timer.isExpired,
        isTimerRunning:
          competition.timer.running === true &&
          !['PAUSED', 'RESUME_PENDING'].includes(competition.interruption?.status ?? ''),
        waitingForDirector:
          competition.phase === 'SERIES_COMPLETE' &&
          competition.timer.running === false &&
          !competition.timer.isExpired &&
          !competition.interruption,
        interruption: competition.interruption,
        athleteTargetControl: competition.athleteTargetControl,
        athleteTargetControlLoaded: true,
        athleteTargetControlPending: false,
        targetProfileId:
          competition.targetProfileId && isTargetScoringProfileId(competition.targetProfileId)
            ? competition.targetProfileId
            : undefined,
        scoringGaugeProfileId:
          competition.scoringGaugeProfileId && isScoringGaugeProfileId(competition.scoringGaugeProfileId)
            ? competition.scoringGaugeProfileId
            : undefined,
      });
    };
    void (async () => {
      let state: StartupStateDto;
      try {
        state = await (attempt === 0 ? getStartup() : retryStartup());
        await hydrate(state);
        if (dirty) {
          dirty = false;
          state = await getStartup();
          await hydrate(state, true);
        }
      } catch (error) {
        state = {
          status: 'ERROR',
          error: error instanceof Error ? error.message : String(error),
          competitionId: null,
          sessionId: null,
          currentSeriesStartIndex: 0,
          canFinish: false,
        };
      }
      await minimum;
      if (!cancelled) {
        setStartup(state);
        setScreen(state.status === 'READY' ? 'main' : 'recovery');
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(splashTimer);
      unsubscribe.forEach((stop) => stop());
    };
  }, [attempt]);

  return { screen, startup, retry };
}
