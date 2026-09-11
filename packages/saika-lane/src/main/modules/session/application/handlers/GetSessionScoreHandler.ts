// SPDX-License-Identifier: MIT
import type { GetSessionScoreInput } from '@/main/composition/tokens';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { QueryHandler } from '@/main/shared-infra/cqrs';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { SessionScoreDto } from '../dto';

export function createGetSessionScoreHandler(
  sessionRepo: ISessionRepository,
): QueryHandler<GetSessionScoreInput, SessionScoreDto> {
  return async (input) => {
    const session = await sessionRepo.findById(input.sessionId);

    if (!session) {
      throw ErrorCatalog.createError('SESSION_NOT_FOUND');
    }

    // Calculate scores per series (only series with match shots)
    const seriesScores = session.series
      .filter((series) => series.count > 0) // Only series with shots
      .map((series) => {
        return series.total;
      });

    return {
      sessionId: session.id,
      totalScore: session.totalScore,
      seriesScores,
      shotCount: session.shotCount,
      discipline: session.discipline.value,
      mode: session.mode.value,
    };
  };
}
