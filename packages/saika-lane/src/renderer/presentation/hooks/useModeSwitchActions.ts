// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react';

import { useCompetition } from '@/renderer/presentation/hooks/useCompetition';
import { useSession } from '@/renderer/presentation/hooks/useSession';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

export interface ModeSwitchActions {
  handlePreparationClick: () => Promise<void>;
  handleMatchClick: () => Promise<void>;
  handleNextStageClick: () => Promise<void>;
}

interface PendingConfirmation {
  message: string;
  competitionId: string | null;
  sessionId: string | null;
  phase: ReturnType<typeof useCompetitionStore.getState>['phase'];
  action: () => Promise<void>;
}

function isCurrentConfirmation(pending: PendingConfirmation): boolean {
  const { competitionId, phase } = useCompetitionStore.getState();
  return (
    competitionId === pending.competitionId &&
    phase === pending.phase &&
    useSessionStore.getState().currentSessionId === pending.sessionId
  );
}

export function useModeSwitchActions() {
  const { switchMode } = useSession();
  const { startStage, startNextSeries, advanceStage, endStage } = useCompetition();
  const markPreparationShotNumberReset = useSessionStore((s) => s.markPreparationShotNumberReset);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const pendingRef = useRef<PendingConfirmation | null>(null);

  const cancelConfirmation = useCallback(() => {
    pendingRef.current = null;
    setConfirmation(null);
  }, []);

  const confirm = useCallback(async () => {
    const pending = pendingRef.current;
    cancelConfirmation();
    if (pending && isCurrentConfirmation(pending)) await pending.action();
  }, [cancelConfirmation]);

  const requestConfirmation = useCallback((message: string, action: () => Promise<void>) => {
    if (pendingRef.current) return;
    const { competitionId, phase } = useCompetitionStore.getState();
    const pending = {
      message,
      competitionId,
      phase,
      sessionId: useSessionStore.getState().currentSessionId,
      action,
    };
    pendingRef.current = pending;
    setConfirmation(pending);
  }, []);

  useEffect(() => {
    const cancelIfChanged = () => {
      const pending = pendingRef.current;
      if (pending && !isCurrentConfirmation(pending)) cancelConfirmation();
    };
    const unsubscribeCompetition = useCompetitionStore.subscribe(cancelIfChanged);
    const unsubscribeSession = useSessionStore.subscribe(cancelIfChanged);
    return () => {
      unsubscribeCompetition();
      unsubscribeSession();
    };
  }, [cancelConfirmation]);

  useEffect(() => {
    if (!confirmation) return;
    const timeout = window.setTimeout(cancelConfirmation, 5000);
    return () => window.clearTimeout(timeout);
  }, [confirmation, cancelConfirmation]);

  const prepare = useCallback(async () => {
    const { competitionId, phase } = useCompetitionStore.getState();
    if (competitionId && phase !== 'FINISHED') {
      try {
        await startStage(competitionId);
        markPreparationShotNumberReset();
      } catch {
        // Error handled by useCompetition
      }
    } else {
      try {
        await switchMode('SIGHTING');
        markPreparationShotNumberReset();
      } catch {
        // Error handled by useSession
      }
    }
  }, [startStage, switchMode, markPreparationShotNumberReset]);

  const match = useCallback(async () => {
    const { competitionId, phase } = useCompetitionStore.getState();
    if (competitionId && phase !== 'FINISHED') {
      try {
        if (phase === 'ACTIVE') {
          const scored = useCompetitionStore.getState().scored;
          if (!scored) {
            await endStage(competitionId);
            await advanceStage(competitionId);
            await startNextSeries(competitionId);
          }
        } else if (phase === 'SERIES_COMPLETE' || phase === 'SERIES_ENTERED' || phase === 'STAGE_ENTERED') {
          await startNextSeries(competitionId);
        }
      } catch {
        // Error handled by useCompetition
      }
    } else {
      try {
        await switchMode('MATCH');
      } catch {
        // Error handled by useSession
      }
    }
  }, [endStage, advanceStage, startNextSeries, switchMode]);

  const handlePreparationClick = useCallback(async () => {
    if (pendingRef.current) return;
    const { competitionId, phase } = useCompetitionStore.getState();
    const { shots, currentSeriesStartIndex } = useSessionStore.getState();
    if (competitionId && phase !== 'FINISHED') {
      if (phase !== 'IDLE' && shots.length > 0) {
        requestConfirmation('End this session and start over? The current session will be saved as finished.', prepare);
        return;
      }
    } else if (shots.length > currentSeriesStartIndex) {
      requestConfirmation('Start a new Preparation series?', prepare);
      return;
    }
    await prepare();
  }, [prepare, requestConfirmation]);

  const handleMatchClick = useCallback(async () => {
    if (pendingRef.current) return;
    const { competitionId, phase, scored } = useCompetitionStore.getState();
    const { shots, currentSeriesStartIndex } = useSessionStore.getState();
    if (competitionId && phase !== 'FINISHED') {
      if (phase === 'ACTIVE' && !scored && shots.length > currentSeriesStartIndex) {
        requestConfirmation('End preparation and start the match?', match);
        return;
      }
    } else if (shots.length > currentSeriesStartIndex) {
      requestConfirmation('Start a new Match series?', match);
      return;
    }
    await match();
  }, [match, requestConfirmation]);

  const handleNextStageClick = useCallback(async () => {
    const { competitionId, phase, scored } = useCompetitionStore.getState();
    if (!competitionId || phase === 'FINISHED') return;

    try {
      if (phase === 'ACTIVE' && !scored) {
        await endStage(competitionId);
      } else if (phase === 'SERIES_COMPLETE') {
        await advanceStage(competitionId);
      }
    } catch {
      // Error handled by useCompetition
    }
  }, [endStage, advanceStage]);

  return { handlePreparationClick, handleMatchClick, handleNextStageClick, confirmation, confirm, cancelConfirmation };
}
