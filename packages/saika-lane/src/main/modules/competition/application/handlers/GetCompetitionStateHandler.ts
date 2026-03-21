// SPDX-License-Identifier: MIT
import type { GetCompetitionStateInput } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { QueryHandler } from '@/main/shared-infra/cqrs';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { CompetitionStateDto } from '../dto';

/**
 * createGetCompetitionStateHandler
 *
 * Query handler factory for retrieving competition state.
 * Converts CompetitionState → CompetitionStateDto and returns it.
 */
export function createGetCompetitionStateHandler(
  competitionRepository: ICompetitionRepository,
): QueryHandler<GetCompetitionStateInput, CompetitionStateDto> {
  return async (input) => {
    const state = await competitionRepository.findById(input.competitionId);
    if (!state) {
      throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { id: input.competitionId });
    }

    return {
      id: state.id,
      sessionId: state.sessionId,
      phase: state.phase,
      currentStageIndex: state.currentStageIndex,
      currentSeriesIndex: state.currentSeriesIndex,
      seriesShotCount: state.seriesShotCount,
      timer: {
        remainingSeconds: state.timer.remainingSeconds,
        totalSeconds: state.timer.totalSeconds,
        formattedRemaining: state.timer.formattedRemaining,
        isExpired: state.timer.isExpired,
      },
      currentStageName: state.currentStageConfig.name,
      scored: state.currentStageConfig.scored,
      shotsPerSeries: state.config.shotsPerSeries,
    };
  };
}
