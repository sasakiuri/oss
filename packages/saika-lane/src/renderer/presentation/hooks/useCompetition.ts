// SPDX-License-Identifier: MIT
import { useCallback } from 'react';

import { useAsyncAction, UseAsyncActionResult } from '@/renderer/presentation/hooks/useAsyncAction';
import { competitionService } from '@/renderer/services/competitionService';

export interface UseCompetitionResult {
  startCompetition: (competitionTypeId: string) => Promise<{ competitionId: string; sessionId: string }>;
  startStage: (competitionId: string) => Promise<{ sessionId: string }>;
  endStage: (competitionId: string) => Promise<void>;
  startNextSeries: (competitionId: string) => Promise<void>;
  advanceStage: (competitionId: string) => Promise<void>;
  finishCompetition: (competitionId: string) => Promise<void>;
  loading: boolean;
  error: Error | null;
}

function useActionWithClear<TArgs extends unknown[], TResult>(
  action: UseAsyncActionResult<TArgs, TResult>,
  clearAll: () => void,
): (...args: TArgs) => Promise<TResult> {
  return useCallback(
    async (...args: TArgs) => {
      clearAll();
      return action.execute(...args);
    },
    [action.execute, clearAll],
  );
}

export function useCompetition(): UseCompetitionResult {
  const start = useAsyncAction(
    async (competitionTypeId: string) => competitionService.startCompetition({ competitionTypeId }),
    { errorMessage: 'An error occurred while starting the competition' },
  );
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
  const finish = useAsyncAction(
    async (competitionId: string) => {
      await competitionService.finishCompetition({ competitionId });
    },
    { errorMessage: 'An error occurred while finishing the competition' },
  );

  const allActions = [start, stage, endStg, nextSeries, advance, finish] as const;

  const clearAllErrors = useCallback(() => {
    for (const a of allActions) a.clearError();
  }, [
    start.clearError,
    stage.clearError,
    endStg.clearError,
    nextSeries.clearError,
    advance.clearError,
    finish.clearError,
  ]);

  const startCompetition = useActionWithClear(start, clearAllErrors);
  const startStage = useActionWithClear(stage, clearAllErrors);
  const endStage = useActionWithClear(endStg, clearAllErrors);
  const startNextSeries = useActionWithClear(nextSeries, clearAllErrors);
  const advanceStage = useActionWithClear(advance, clearAllErrors);
  const finishCompetition = useActionWithClear(finish, clearAllErrors);

  return {
    startCompetition,
    startStage,
    endStage,
    startNextSeries,
    advanceStage,
    finishCompetition,
    loading: allActions.some((a) => a.loading),
    error: allActions.find((a) => a.error)?.error ?? null,
  };
}
