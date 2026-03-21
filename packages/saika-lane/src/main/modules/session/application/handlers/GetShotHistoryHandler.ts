// SPDX-License-Identifier: MIT
import type { GetShotHistoryInput } from '@/main/composition/tokens';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { QueryHandler } from '@/main/shared-infra/cqrs';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { ShotDto, ShotHistoryDto } from '../dto';

/**
 * createGetShotHistoryHandler (shot history retrieval handler factory)
 *
 * @description
 * Creates a query handler that processes GetShotHistoryInput and returns the complete
 * shot history of a session as a ShotHistoryDto. Retrieves the session from the repository
 * and converts domain layer Shot entities to ShotDtos.
 *
 * @example
 * ```typescript
 * const handler = createGetShotHistoryHandler(sessionRepository);
 * const result = await handler({ sessionId: 'session-123' });
 * console.log(result.shots.length); // 60
 * ```
 *
 * @param sessionRepo - Session repository
 * @returns QueryHandler<GetShotHistoryInput, ShotHistoryDto> - Query handler function
 */
export function createGetShotHistoryHandler(
  sessionRepo: ISessionRepository,
): QueryHandler<GetShotHistoryInput, ShotHistoryDto> {
  return async (input) => {
    // Retrieve the session
    const session = await sessionRepo.findById(input.sessionId);

    if (!session) {
      throw ErrorCatalog.createError('SESSION_NOT_FOUND');
    }

    // Convert Shot entities to ShotDtos
    const shots: ShotDto[] = session.allShots.map((shot) => {
      return {
        id: shot.id,
        shotNumber: shot.shotNumber,
        x: shot.impactPoint !== null ? shot.impactPoint.x : null,
        y: shot.impactPoint !== null ? shot.impactPoint.y : null,
        score: shot.score.value,
        innerTen: shot.innerTen,
        timestamp: shot.timestamp.toISOString(),
        mode: shot.mode.value,
        isRecorded: shot.mode.isMatch(), // Only match shots are recorded
      };
    });

    return {
      sessionId: session.id,
      shots,
    };
  };
}
