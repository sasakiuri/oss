// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react';

import { useCompetition } from '@/renderer/presentation/hooks/useCompetition';
import { useSession } from '@/renderer/presentation/hooks/useSession';
import { localProgressControls } from '@/renderer/presentation/policies/localProgressControls';
import {
  retryAthleteTargetControl,
  selectAthleteTargetMode,
} from '@/renderer/presentation/stores/athleteTargetControl';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useDirectorMembershipStore } from '@/renderer/presentation/stores/directorMembershipStore';
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
  membershipRevision: number | undefined;
  stageIndex: number;
  seriesIndex: number;
  athleteControlled: boolean;
  targetControlLoaded: boolean;
  action: () => Promise<void>;
}

function isCurrentConfirmation(pending: PendingConfirmation): boolean {
  const { competitionId, phase } = useCompetitionStore.getState();
  return (
    localProgressControls(useDirectorMembershipStore.getState()).allowed &&
    useDirectorMembershipStore.getState().membership?.revision === pending.membershipRevision &&
    useCompetitionStore.getState().stageIndex === pending.stageIndex &&
    useCompetitionStore.getState().seriesIndex === pending.seriesIndex &&
    Boolean(useCompetitionStore.getState().athleteTargetControl) === pending.athleteControlled &&
    useCompetitionStore.getState().athleteTargetControlLoaded === pending.targetControlLoaded &&
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
    if (pendingRef.current || !localProgressControls(useDirectorMembershipStore.getState()).allowed) return;
    const { competitionId, phase } = useCompetitionStore.getState();
    const pending = {
      message,
      membershipRevision: useDirectorMembershipStore.getState().membership?.revision,
      stageIndex: useCompetitionStore.getState().stageIndex,
      seriesIndex: useCompetitionStore.getState().seriesIndex,
      athleteControlled: Boolean(useCompetitionStore.getState().athleteTargetControl),
      targetControlLoaded: useCompetitionStore.getState().athleteTargetControlLoaded,
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
    const unsubscribeMembership = useDirectorMembershipStore.subscribe(cancelIfChanged);
    return () => {
      unsubscribeCompetition();
      unsubscribeSession();
      unsubscribeMembership();
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
            if (!localProgressControls(useDirectorMembershipStore.getState()).allowed) return;
            await advanceStage(competitionId);
            if (!localProgressControls(useDirectorMembershipStore.getState()).allowed) return;
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
    const competition = useCompetitionStore.getState();
    if (pendingRef.current) return;
    if (!localProgressControls(useDirectorMembershipStore.getState(), 'sighting', competition).allowed) {
      await retryAthleteTargetControl();
      return;
    }
    if (competition.phase === 'ACTIVE' && competition.athleteTargetControl) {
      await selectAthleteTargetMode('SIGHTING');
      return;
    }
    const { competitionId, phase } = useCompetitionStore.getState();
    const { shots, currentSeriesStartIndex } = useSessionStore.getState();
    if (competitionId && phase !== 'FINISHED') {
      if (phase !== 'IDLE' && shots.length > 0) {
        requestConfirmation(
          phase === 'ACTIVE'
            ? 'End this session and wait to start again? The current session will be saved as finished.'
            : 'End this session and start the first stage again? The current session will be saved as finished.',
          prepare,
        );
        return;
      }
    } else if (phase !== 'FINISHED' && shots.length > currentSeriesStartIndex) {
      requestConfirmation('Start a new Preparation series?', prepare);
      return;
    }
    await prepare();
  }, [prepare, requestConfirmation]);

  const handleMatchClick = useCallback(async () => {
    const competition = useCompetitionStore.getState();
    if (pendingRef.current) return;
    if (!localProgressControls(useDirectorMembershipStore.getState(), 'match', competition).allowed) {
      await retryAthleteTargetControl();
      return;
    }
    if (competition.phase === 'ACTIVE' && competition.athleteTargetControl) {
      await selectAthleteTargetMode('MATCH');
      return;
    }
    const { competitionId, phase, scored } = useCompetitionStore.getState();
    const { shots, currentSeriesStartIndex } = useSessionStore.getState();
    if (competitionId && phase !== 'FINISHED') {
      if (phase === 'ACTIVE' && !scored && shots.length > currentSeriesStartIndex) {
        requestConfirmation('End preparation and start the match?', match);
        return;
      }
    } else if (phase !== 'FINISHED' && shots.length > currentSeriesStartIndex) {
      requestConfirmation('Start a new Match series?', match);
      return;
    }
    await match();
  }, [match, requestConfirmation]);

  const handleNextStageClick = useCallback(async () => {
    if (!localProgressControls(useDirectorMembershipStore.getState()).allowed) return;
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
