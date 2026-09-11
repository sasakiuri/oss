// SPDX-License-Identifier: MIT
import type { GetShotHistoryInput } from '@/main/composition/tokens';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { QueryHandler } from '@/main/shared-infra/cqrs';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { ShotDto, ShotHistoryDto } from '../dto';

export function createGetShotHistoryHandler(
  sessionRepo: ISessionRepository,
): QueryHandler<GetShotHistoryInput, ShotHistoryDto> {
  return async (input) => {
    const session = await sessionRepo.findById(input.sessionId);

    if (!session) {
      throw ErrorCatalog.createError('SESSION_NOT_FOUND');
    }

    const shots: ShotDto[] = session.allShots.map((shot) => {
      return {
        id: shot.id,
        shotNumber: shot.shotNumber,
        seriesNumber: shot.seriesNumber,
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
