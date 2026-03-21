// SPDX-License-Identifier: MIT
import { useCallback } from 'react';

import { useCompetition } from '@/renderer/presentation/hooks/useCompetition';
import { useSession } from '@/renderer/presentation/hooks/useSession';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';

export interface ModeSwitchActions {
  handlePreparationClick: () => Promise<void>;
  handleMatchClick: () => Promise<void>;
  handleNextStageClick: () => Promise<void>;
}

export function useModeSwitchActions(): ModeSwitchActions {
  const { switchMode } = useSession();
  const { startStage, startNextSeries, advanceStage, endStage } = useCompetition();

  const handlePreparationClick = useCallback(async () => {
    const { competitionId, phase } = useCompetitionStore.getState();
    if (competitionId && phase !== 'FINISHED') {
      try {
        await startStage(competitionId);
      } catch {
        // Error handled by useCompetition
      }
    } else {
      try {
        await switchMode('SIGHTING');
      } catch {
        // Error handled by useSession
      }
    }
  }, [startStage, switchMode]);

  const handleMatchClick = useCallback(async () => {
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

  return { handlePreparationClick, handleMatchClick, handleNextStageClick };
}
