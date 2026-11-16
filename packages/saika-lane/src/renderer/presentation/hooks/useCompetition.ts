// SPDX-License-Identifier: MIT
import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { competitionService } from '@/renderer/services/competitionService';

/** Local competition progress commands; a rejection that is not an Error gets the action's default message. */
export interface UseCompetitionResult {
  startStage: (competitionId: string) => Promise<{ sessionId: string }>;
  endStage: (competitionId: string) => Promise<void>;
  startNextSeries: (competitionId: string) => Promise<void>;
  advanceStage: (competitionId: string) => Promise<void>;
}

export function useCompetition(): UseCompetitionResult {
  const stage = useAsyncAction(async (competitionId: string) => competitionService.startStage({ competitionId }), {
    errorMessage: 'An error occurred while starting preparation',
  });
  const endStg = useAsyncAction(
    async (competitionId: string) => {
      await competitionService.endStage({ competitionId });
    },
    { errorMessage: 'An error occurred while ending sighting' },
  );
  const nextSeries = useAsyncAction(
    async (competitionId: string) => {
      await competitionService.startNextSeries({ competitionId });
    },
    { errorMessage: 'An error occurred while starting the match series' },
  );
  const advance = useAsyncAction(
    async (competitionId: string) => {
      await competitionService.advanceStage({ competitionId });
    },
    { errorMessage: 'An error occurred while advancing the stage' },
  );

  return {
    startStage: stage.execute,
    endStage: endStg.execute,
    startNextSeries: nextSeries.execute,
    advanceStage: advance.execute,
  };
}
