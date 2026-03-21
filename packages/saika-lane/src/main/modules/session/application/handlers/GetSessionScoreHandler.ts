// SPDX-License-Identifier: MIT
import type { GetSessionScoreInput } from '@/main/composition/tokens';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { QueryHandler } from '@/main/shared-infra/cqrs';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { SessionScoreDto } from '../dto';

/**
 * createGetSessionScoreHandler (session score retrieval handler factory)
 *
 * @description
 * Creates a query handler that processes GetSessionScoreInput and returns session score
 * information as a SessionScoreDto. Retrieves the session from the repository and
 * converts the domain layer entity to a DTO.
 *
 * @example
 * ```typescript
 * const handler = createGetSessionScoreHandler(sessionRepository);
 * const result = await handler({ sessionId: 'session-123' });
 * console.log(result.totalScore); // 985
 * ```
 *
 * @param sessionRepo - Session repository
 * @returns QueryHandler<GetSessionScoreInput, SessionScoreDto> - Query handler function
 */
export function createGetSessionScoreHandler(
  sessionRepo: ISessionRepository,
): QueryHandler<GetSessionScoreInput, SessionScoreDto> {
  return async (input) => {
    // Retrieve the session
    const session = await sessionRepo.findById(input.sessionId);

    if (!session) {
      throw ErrorCatalog.createError('SESSION_NOT_FOUND');
    }

    // Calculate scores per series (only series with match shots)
    const seriesScores = session.series
      .filter((series) => series.count > 0) // Only series with shots
      .map((series) => {
        // Round to 1 decimal place
        return series.total;
      });

    // Convert domain layer entity to DTO
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
