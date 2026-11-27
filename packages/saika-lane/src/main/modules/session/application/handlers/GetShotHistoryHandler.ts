// SPDX-License-Identifier: MIT
import type { GetShotHistoryInput } from '@/main/composition/tokens';
import { previousPositionLabel } from '@/main/modules/competition/domain/CompetitionShotModePolicy';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { IShotObservationRepository } from '@/main/modules/shot-observation/domain/IShotObservationRepository';
import type { QueryHandler } from '@/main/shared-infra/cqrs';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { ShotDto, ShotHistoryDto } from '../dto';
import { toShotDto } from '../toShotDto';

export function createGetShotHistoryHandler(
  sessionRepo: ISessionRepository,
  observations: IShotObservationRepository,
  competitions: ICompetitionRepository,
): QueryHandler<GetShotHistoryInput, ShotHistoryDto> {
  return async (input) => {
    const session = await sessionRepo.findById(input.sessionId);

    if (!session) {
      throw ErrorCatalog.createError('SESSION_NOT_FOUND');
    }

    const shots: ShotDto[] = await Promise.all(
      session.allShots.map(async (shot) => {
        const observation = shot.sourceObservationId ? await observations.findById(shot.sourceObservationId) : null;
        return toShotDto(shot, observation?.reportedMode ?? null);
      }),
    );
    const extras = await observations.findBySessionAndOutcome(session.id, 'NULLIFIED_POSITION_EXTRA');
    const nullifiedExtras = await Promise.all(
      extras.map(async (evidence) => {
        const context = evidence.competition;
        const competition = context ? await competitions.findById(context.competitionId) : null;
        return {
          id: evidence.observationId,
          receivedAt: evidence.receivedAt.toISOString(),
          deviceScoreX10: evidence.deviceScoreX10,
          reportedMode: evidence.reportedMode,
          detail: evidence.detail,
          previousPositionLabel: previousPositionLabel(
            context ? competition?.config.stages[context.stageIndex] : undefined,
            context?.seriesIndex ?? 0,
          ),
          competitionContext: context,
        };
      }),
    );

    return {
      sessionId: session.id,
      shots,
      nullifiedExtras,
    };
  };
}
