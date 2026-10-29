// SPDX-License-Identifier: MIT
import type { GetCompetitionStateInput } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { QueryHandler } from '@/main/shared-infra/cqrs';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { CompetitionStateDto } from '../dto';
import { toCompetitionStateDto } from '../toCompetitionStateDto';

/**
 * createGetCompetitionStateHandler
 *
 * Query handler factory for retrieving competition state.
 * Converts CompetitionState → CompetitionStateDto and returns it.
 */
export function createGetCompetitionStateHandler(
  competitionRepository: ICompetitionRepository,
  sessionRepository: ISessionRepository,
  interruptions: Pick<ICompetitionInterruptionControl, 'get'>,
): QueryHandler<GetCompetitionStateInput, CompetitionStateDto> {
  return async (input) => {
    const state = await competitionRepository.findById(input.competitionId);
    if (!state) {
      throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { id: input.competitionId });
    }

    const session = await sessionRepository.findById(state.sessionId);
    return toCompetitionStateDto(state, session?.allShots, interruptions.get(state.id));
  };
}
